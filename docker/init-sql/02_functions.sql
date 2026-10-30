-- =============================================================================
-- 02_functions.sql — Logique serveur : déclencheurs et fonctions
--
-- La règle métier la plus importante (ne jamais survendre) est appliquée DANS la
-- base, pas seulement dans l'API : même un INSERT manuel ne peut pas la violer.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Déclencheur 1 : réserver / libérer le stock quand une ligne de commande
-- est ajoutée ou supprimée.
-- L'UPDATE ... WHERE quantity_sold + n <= quantity_total est atomique : il pose
-- un verrou sur la ligne ticket_types, donc deux achats simultanés de la
-- dernière place ne peuvent pas réussir tous les deux.
-- -----------------------------------------------------------------------------
CREATE FUNCTION trg_order_items_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE ticket_types
           SET quantity_sold = quantity_sold + NEW.quantity
         WHERE id = NEW.ticket_type_id
           AND quantity_sold + NEW.quantity <= quantity_total;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Stock insuffisant pour le type de billet %', NEW.ticket_type_id
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    ELSE -- DELETE
        UPDATE ticket_types
           SET quantity_sold = quantity_sold - OLD.quantity
         WHERE id = OLD.ticket_type_id;
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER order_items_stock
    AFTER INSERT OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION trg_order_items_stock();

-- -----------------------------------------------------------------------------
-- Déclencheur 2 : quand une commande passe à "cancelled" ou "refunded",
-- on remet les places en vente et on annule les billets associés.
-- -----------------------------------------------------------------------------
CREATE FUNCTION trg_orders_cancel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('cancelled', 'refunded')
       AND OLD.status IN ('pending', 'paid') THEN

        UPDATE ticket_types tt
           SET quantity_sold = tt.quantity_sold - oi.quantity
          FROM order_items oi
         WHERE oi.order_id = NEW.id
           AND oi.ticket_type_id = tt.id;

        UPDATE tickets t
           SET status = 'cancelled'
          FROM order_items oi
         WHERE oi.order_id = NEW.id
           AND t.order_item_id = oi.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_cancel
    AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION trg_orders_cancel();

-- -----------------------------------------------------------------------------
-- Fonction place_order : passe une commande complète en une seule transaction.
--   p_user_id : client
--   p_items   : '[{"ticket_type_id": 12, "quantity": 2}, ...]'
-- Retourne l'id de la commande créée (statut "paid", billets générés).
-- En cas d'erreur (stock, événement passé...), RIEN n'est enregistré :
-- l'exception annule toute la transaction.
-- -----------------------------------------------------------------------------
CREATE FUNCTION place_order(p_user_id BIGINT, p_items JSONB) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_order_id BIGINT;
    v_holder   TEXT;
    v_item     JSONB;
    v_tt       RECORD;
    v_qty      INTEGER;
    v_oi_id    BIGINT;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La commande doit contenir au moins un article'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT first_name || ' ' || last_name INTO v_holder FROM users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Utilisateur % introuvable', p_user_id
            USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO orders (user_id, status) VALUES (p_user_id, 'pending')
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item ->> 'quantity')::INTEGER;

        SELECT tt.id, tt.price, e.status, e.starts_at
          INTO v_tt
          FROM ticket_types tt
          JOIN events e ON e.id = tt.event_id
         WHERE tt.id = (v_item ->> 'ticket_type_id')::BIGINT;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Type de billet % introuvable', v_item ->> 'ticket_type_id'
                USING ERRCODE = 'no_data_found';
        END IF;
        IF v_tt.status <> 'published' OR v_tt.starts_at <= now() THEN
            RAISE EXCEPTION 'L''événement n''est plus en vente'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        -- le déclencheur order_items_stock vérifie et réserve le stock ici
        INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price)
        VALUES (v_order_id, v_tt.id, v_qty, v_tt.price)
        RETURNING id INTO v_oi_id;

        INSERT INTO tickets (order_item_id, holder_name)
        SELECT v_oi_id, v_holder FROM generate_series(1, v_qty);
    END LOOP;

    -- paiement simulé : la commande est immédiatement payée
    UPDATE orders
       SET status = 'paid',
           paid_at = now(),
           total_amount = (SELECT sum(quantity * unit_price)
                             FROM order_items WHERE order_id = v_order_id)
     WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION place_order(BIGINT, JSONB) IS
    'Crée une commande payée avec ses billets ; tout ou rien (transaction)';

COMMIT;
