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

## Accès aux bases

| Outil | URL / commande | Identifiants |
|---|---|---|
| pgAdmin | http://localhost:5050 | serveur pré-enregistré, mot de passe `postgres_dev_only` |
| Mongo Express | http://localhost:8081 | — |
| psql | `docker exec -it billetterie-postgres psql -U postgres -d billetterie` | — |

Comptes de démonstration de l'application (mot de passe `demo1234`) :
`admin@example.com` (administrateur) et `client@example.com` (client).

## Arborescence

```
/                      README.md, docker-compose.yml, .env.example
/docker/init-sql       scripts de création + peuplement PostgreSQL
/docker/init-nosql     scripts de création + peuplement MongoDB et Redis
/api                   code source de l'API (Node.js / Express)
/front                 code source du frontend (React)
/docs                  presentation.md + schémas
/docs/video            vidéo de présentation
```

## Utilisation d'outils d'IA

Ce projet a été développé avec l'aide de Claude (Anthropic) via Claude Code, utilisé comme
assistant pour la conception, l'écriture du code et de la documentation. Chaque partie a été
relue, testée et comprise par l'auteur.
