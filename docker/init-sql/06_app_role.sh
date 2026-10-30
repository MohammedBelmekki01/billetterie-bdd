#!/bin/sh
# =============================================================================
# 06_app_role.sh — Rôle applicatif aux droits limités
#
# Script shell (et non .sql) pour lire le mot de passe dans les variables
# d'environnement du conteneur au lieu de l'écrire en dur dans le dépôt.
# L'API se connecte avec ce rôle, jamais avec le superutilisateur "postgres".
# =============================================================================
set -e

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v app_user="$APP_DB_USER" \
     -v app_password="$APP_DB_PASSWORD" \
     -v db_name="$POSTGRES_DB" <<'EOSQL'

-- Rôle de connexion, sans aucun privilège d'administration
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Lecture / écriture des données, mais pas de modification du schéma
-- (pas de CREATE, ALTER, DROP, TRUNCATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON FUNCTION place_order(BIGINT, JSONB) TO :"app_user";

-- Les comptes et les salles ne se suppriment pas depuis l'application
REVOKE DELETE ON users, venues, categories FROM :"app_user";

EOSQL

echo "Rôle applicatif '$APP_DB_USER' créé."
