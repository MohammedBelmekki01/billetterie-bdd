# Billetterie — Projet final BDD (M1 Dév · EFREI)

Application de billetterie d'événements (concerts, spectacles, conférences) qui s'appuie sur
trois bases de données de familles différentes, chacune choisie pour un besoin précis.

> 🚧 Projet en cours de construction — ce README sera complété à chaque étape.

## Pile technique

| Composant | Technologie | Rôle |
|---|---|---|
| Base relationnelle | PostgreSQL 18 | Utilisateurs, salles, événements, commandes, billets (transactions, intégrité) |
| Base document | MongoDB 8 | Pages d'événements au contenu variable, avis des spectateurs |
| Base clé-valeur (bonus) | Redis 8 | Réservation temporaire de places (TTL), classement des événements tendance |
| API | Node.js 26 + Express | API REST connectée aux trois bases |
| Frontend (bonus) | React + Vite | Interface web connectée à l'API |

## Prérequis

- Docker Desktop (ou Docker Engine + Docker Compose v2)
- Git

## Démarrage

```bash
git clone https://github.com/MohammedBelmekki01/billetterie-bdd.git
cd billetterie-bdd
docker compose up -d --build
```

Aucune configuration n'est nécessaire : des valeurs de développement sont fournies par défaut.
Pour les personnaliser, copier `.env.example` en `.env`.

La pile démarre et se peuple en une vingtaine de secondes (le premier lancement télécharge
les images Docker). Ensuite :

| Service | URL |
|---|---|
| **Application web** | **http://localhost:5173** |
| API REST | http://localhost:3000/api |

## Accès aux bases

| Outil | URL / commande | Identifiants |
|---|---|---|
| pgAdmin | http://localhost:5050 | serveur pré-enregistré, mot de passe `postgres_dev_only` |
| Mongo Express | http://localhost:8081 | — |
| psql | `docker exec -it billetterie-postgres psql -U postgres -d billetterie` | — |

Comptes de démonstration de l'application (mot de passe `demo1234`) :
`admin@example.com` (administrateur) et `client@example.com` (client).

## Requêtes de démonstration

Les requêtes avancées sont rassemblées, commentées (intention + explication), dans `docs/`.
Elles ne modifient pas les données.

| Fichier | Contenu | Lancement |
|---|---|---|
| [docs/sql/advanced_queries.sql](docs/sql/advanced_queries.sql) | CTE, GROUP BY / HAVING, FILTER, RANK, LAG, sous-requête corrélée, NOT EXISTS, LEFT JOIN, transaction | `docker exec -it billetterie-postgres psql -U postgres -d billetterie -f /docs/sql/advanced_queries.sql` |
| [docs/sql/explain_index.sql](docs/sql/explain_index.sql) | `EXPLAIN ANALYZE` avant / après index | `docker exec -it billetterie-postgres psql -U postgres -d billetterie -f /docs/sql/explain_index.sql` |
| [docs/nosql/mongo_queries.js](docs/nosql/mongo_queries.js) | schéma variable, recherche texte, index sur tableau, `$facet` / `$lookup`, `$unwind`, validateur | `docker exec -it billetterie-mongo mongosh -u root -p mongo_dev_only --authenticationDatabase admin billetterie --quiet --file /docs/nosql/mongo_queries.js` |
| [docs/nosql/redis_commands.md](docs/nosql/redis_commands.md) | ZSET, cache avec TTL, HASH panier, SET de votes, persistance | `docker exec -it billetterie-redis redis-cli -a redis_dev_only --no-auth-warning` |

## API

URL de base : **http://localhost:3000/api** — exemples prêts à l'emploi dans [api/requests.http](api/requests.http).
Authentification : `Authorization: Bearer <jeton>` (obtenu via `/auth/login`).

| Méthode | Route | Bases | Description |
|---|---|---|---|
| GET | `/health` | PG · Mongo · Redis | État des connexions |
| POST | `/auth/register`, `/auth/login` | PG | Inscription, connexion (JWT) |
| GET | `/auth/me` | PG | Profil connecté |
| GET | `/categories`, `/venues`, `/cities` | PG | Données de référence |
| GET | `/events` | PG (vue) | Catalogue filtrable et paginé |
| GET | `/events/trending` | Redis + PG | Classement des ventes (ZSET) |
| GET | `/events/search?q=` | Mongo + PG | Recherche plein texte |
| GET | `/events/:id` | PG + Mongo + Redis | Fiche complète, cache TTL 60 s, compteur de vues |
| POST / PATCH / DELETE | `/events[/:id]` | PG + Mongo | Gestion des événements (admin) |
| PUT | `/events/:id/page` | Mongo | Contenu éditorial (admin) |
| GET / PUT / DELETE | `/cart`, `/cart/items[/:id]` | Redis + PG | Panier (HASH, TTL 15 min) |
| POST | `/orders` | Redis → PG → Redis | Paiement du panier (`place_order`) |
| GET | `/orders`, `/orders/:id` | PG | Mes commandes, détail avec billets |
| POST | `/orders/:id/cancel` | PG + Redis | Annulation (déclencheur de remise en stock) |
| GET / POST | `/events/:id/reviews` | Mongo (+ PG) | Avis ; écriture réservée aux spectateurs |
| PATCH / DELETE | `/reviews/:id` | Mongo | Modifier / supprimer son avis |
| POST | `/reviews/:id/helpful` | Redis + Mongo | Vote « utile » (une fois par personne) |
| GET | `/me/reviews` | Mongo | Mes avis |
| GET | `/stats/*` | PG + Mongo | Tableau de bord admin (requêtes avancées) |

Codes d'erreur : `400` données invalides · `401` non connecté · `403` interdit ·
`404` ressource absente · `409` conflit (stock, doublon, état) · `500` erreur interne.

## Arborescence

```
/                      README.md, docker-compose.yml, .env.example
/docker/init-sql       scripts de création + peuplement PostgreSQL
/docker/init-nosql/mongo  création des collections, validateurs, index, rôle MongoDB
/docker/init-nosql/seed   service de peuplement MongoDB + Redis (lit PostgreSQL)
/api                   code source de l'API (Node.js / Express)
/front                 frontend React + Vite, servi par nginx (qui relaie /api)
/docs                  presentation.md + schémas
/docs/sql, /docs/nosql requêtes de démonstration commentées (montées dans les conteneurs sous /docs)
/docs/video            vidéo de présentation
```

## Utilisation d'outils d'IA

Ce projet a été développé avec l'aide de Claude (Anthropic) via Claude Code, utilisé comme
assistant pour la conception, l'écriture du code et de la documentation. Chaque partie a été
relue, testée et comprise par l'auteur.
