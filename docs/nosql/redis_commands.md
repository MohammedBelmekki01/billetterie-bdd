# Démonstration Redis — commandes commentées

Redis sert ici à ce qui est **temporaire ou très fréquent** : le cache, le panier qui expire,
les classements et les votes. Ces données peuvent être perdues ou recalculées sans risque :
les données de référence restent dans PostgreSQL et MongoDB.

Ouvrir un terminal Redis :

```bash
docker exec -it billetterie-redis redis-cli -a redis_dev_only --no-auth-warning
```

Convention de nommage des clés : `<domaine>:<entité>:<id>[:<détail>]`.

| Clé | Type | Contenu | Durée de vie |
|---|---|---|---|
| `cache:event:{id}` | STRING | fiche événement complète en JSON | 60 s |
| `cart:user:{id}` | HASH | `ticket_type_id` → quantité | 15 min |
| `ranking:events:sales` | ZSET | `event_id` → billets vendus (30 derniers jours) | permanente |
| `stats:event:views` | ZSET | `event_id` → nombre de vues | permanente |
| `review:{id}:voters` | SET | `user_id` ayant voté « utile » | permanente |
| `meta:seeded_at` | STRING | date du dernier peuplement | permanente |

---

## 1. Voir les clés existantes

```redis
SCAN 0 MATCH * COUNT 100
TYPE ranking:events:sales
```

`SCAN` parcourt les clés par lots, sans bloquer le serveur, contrairement à `KEYS *`.

## 2. Classement des ventes — ZSET (sorted set)

**Intention :** la section « Tendances » de la page d'accueil.

```redis
ZREVRANGE ranking:events:sales 0 4 WITHSCORES
ZSCORE ranking:events:sales 210
ZREVRANK ranking:events:sales 210
```

Exemple de résultat : `576 → 3`, `268 → 12`, `201 → 11` (identifiant de l'événement → billets vendus).
Le ZSET garde les membres **triés en permanence**. Lire le top 5 coûte O(log n + 5), alors qu'en SQL
il faudrait agréger toutes les lignes de commande à chaque affichage. À chaque achat, l'API fait
`ZINCRBY ranking:events:sales <billets> <event_id>`. À chaque annulation, elle soustrait les billets.

## 3. Cache d'une fiche événement — STRING + TTL (cache-aside)

**Intention :** la fiche combine PostgreSQL et MongoDB. On la met en cache pour ne pas refaire
ces requêtes à chaque visite.

Dans un autre terminal (PowerShell), appeler l'API deux fois :

```powershell
curl.exe -s -o NUL -D - http://localhost:3000/api/events/210 | Select-String X-Cache
curl.exe -s -o NUL -D - http://localhost:3000/api/events/210 | Select-String X-Cache
```

Le premier appel répond `X-Cache: MISS` : l'API lit les deux bases, puis écrit le cache.
Le second répond `X-Cache: HIT` : la fiche vient directement de Redis. Dans `redis-cli` :

```redis
EXISTS cache:event:210
TTL cache:event:210
GET cache:event:210
```

`TTL` décompte de 60 à 0 secondes, puis la clé disparaît d'elle-même. Toute modification de
l'événement par un administrateur supprime la clé (`DEL`), pour ne jamais servir une fiche périmée.

## 4. Compteur de vues — ZINCRBY

```redis
ZREVRANGE stats:event:views 0 4 WITHSCORES
```

Chaque affichage d'une fiche fait `ZINCRBY stats:event:views 1 <event_id>`. L'opération est
atomique, donc il n'y a pas de conflit même avec beaucoup de visiteurs en même temps.

## 5. Panier temporaire — HASH + TTL de 15 minutes

**Intention :** un panier abandonné ne doit pas encombrer la base. Il disparaît tout seul.

Se connecter sur le site avec `client@example.com` (identifiant 2) et ajouter des billets, puis :

```redis
HGETALL cart:user:2
TTL cart:user:2
```

Chaque ajout relance le délai de 15 minutes (`EXPIRE`). Au paiement, l'API lit le HASH, appelle
`place_order()` dans PostgreSQL (la transaction), puis supprime le panier.

## 6. Un seul vote « utile » par personne — SET

Après avoir cliqué sur « Utile » sous un avis dans l'application :

```redis
SCAN 0 MATCH review:*:voters
SMEMBERS review:<id>:voters
SISMEMBER review:<id>:voters 2
```

L'API fait `SADD review:<id>:voters <user_id>`. `SADD` renvoie `1` si le membre est nouveau et
`0` s'il existait déjà. Le compteur `helpful_votes` dans MongoDB n'est incrémenté que si la
réponse vaut `1`, ce qui empêche de voter deux fois pour le même avis.

## 7. Persistance

```redis
CONFIG GET appendonly
INFO persistence
```

Le serveur est lancé avec `--appendonly yes` : chaque écriture est ajoutée au journal AOF, donc
le classement et les compteurs survivent à un redémarrage du conteneur. Le classement des ventes
peut de toute façon être reconstruit à partir de PostgreSQL (c'est ce que fait le service `seed`).
