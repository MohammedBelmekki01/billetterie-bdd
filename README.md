//  Billetterie //

Projet final de bases de données, M1 Dév, EFREI.

C'est une application de billetterie pour des événements comme des concerts, des pièces de théâtre, des matchs ou des conférences. On peut parcourir le catalogue, lire les avis, remplir un panier, payer et recevoir ses billets. Un administrateur gère les événements et suit les ventes sur un tableau de bord.

Le projet utilise trois bases de données, chacune pour ce qu'elle fait le mieux :

- PostgreSQL pour les utilisateurs, les salles, les événements, les commandes et les billets
- MongoDB pour les pages de présentation des événements et les avis des spectateurs
- Redis pour le panier temporaire, le cache et le classement des événements les plus vendus

L'API est écrite en Node.js avec Express, et l'interface en React.

Le dossier complet, avec les modèles de données, les choix techniques, les requêtes et la stratégie de sauvegarde, se trouve dans [docs/presentation.md](docs/presentation.md).

// Lancer le projet

Il faut seulement Docker Desktop et Git.

```bash
git clone https://github.com/MohammedBelmekki01/billetterie-bdd.git
cd billetterie-bdd
docker compose up -d --build
```

Aucun réglage n'est nécessaire. Au bout d'une vingtaine de secondes, les bases sont créées et remplies avec des données de démonstration.

| Service | Adresse |
|---|---|
| Application web | http://localhost:5173 |
| API | http://localhost:3000/api |
| pgAdmin | http://localhost:5050 (mot de passe postgres_dev_only) |
| Mongo Express | http://localhost:8081 |

Deux comptes sont prêts à l'emploi, avec le mot de passe demo1234 :

- admin@example.com pour l'administrateur
- client@example.com pour un client

Les mots de passe présents dans le projet servent uniquement au développement. Pour les changer, il suffit de copier .env.example en .env et de modifier les valeurs.

// Les données de démonstration

Au démarrage, on obtient environ 3 000 utilisateurs, 600 événements, 20 000 commandes, 46 000 billets et 5 000 avis. Les trois bases sont cohérentes entre elles : par exemple, seuls les spectateurs qui ont vraiment assisté à un événement ont laissé un avis.

// Les requêtes de démonstration

Les requêtes les plus intéressantes sont rangées dans le dossier docs, avec une explication pour chacune. Elles ne modifient pas les données.

Requêtes PostgreSQL :

```bash
docker exec -it billetterie-postgres psql -U postgres -d billetterie -f /docs/sql/advanced_queries.sql
```

Mesure de l'effet d'un index :

```bash
docker exec -it billetterie-postgres psql -U postgres -d billetterie -f /docs/sql/explain_index.sql
```

Requêtes MongoDB :

```bash
docker exec -it billetterie-mongo mongosh -u root -p mongo_dev_only --authenticationDatabase admin billetterie --quiet --file /docs/nosql/mongo_queries.js
```

Pour Redis, les commandes à essayer sont expliquées pas à pas dans [docs/nosql/redis_commands.md](docs/nosql/redis_commands.md).

// L'API

L'adresse de base est http://localhost:3000/api. Des exemples d'appels sont prêts dans [api/requests.http](api/requests.http).

Ce que l'API permet de faire :

- s'inscrire, se connecter et consulter son profil
- parcourir le catalogue avec des filtres, chercher un événement par mots clés et voir les tendances
- ouvrir la fiche d'un événement, qui réunit les données des trois bases
- gérer son panier, payer et annuler une commande
- publier, modifier ou supprimer son avis, et voter pour les avis utiles
- pour l'administrateur, créer et modifier des événements et consulter les statistiques

Plusieurs routes utilisent plusieurs bases à la fois. Par exemple, le paiement lit le panier dans Redis, enregistre la commande dans PostgreSQL, puis met à jour le classement dans Redis.

En cas d'erreur, l'API répond avec un code clair : 400 pour des données invalides, 401 si l'on n'est pas connecté, 403 si l'action est interdite, 404 si la ressource n'existe pas et 409 en cas de conflit, par exemple un stock épuisé.

// Organisation du projet

| Dossier | Contenu |
| docker/init-sql | création et remplissage de PostgreSQL |
| docker/init-nosql | création de MongoDB et service qui remplit MongoDB et Redis |
| api | code de l'API |
| front | code de l'interface web |
| docs | dossier de présentation et requêtes de démonstration |


