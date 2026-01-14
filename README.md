# steevemauprivez

campus 
https://www.swisstransfer.com/d/b0c0bdcc-0cdc-4c63-9abf-469d4cfe2468

portfolio
https://www.swisstransfer.com/d/985bed9a-1c55-4027-b5f2-d3624d5091af

const isTouch =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 768px)').matches &&
        navigator.maxTouchPoints > 0


master+

Parfait, **uniquement pour ce site (Node.js / MasterPlus)**, voilà **ce que tu dois faire**, point par point.

---

## 1. Préparer le projet sur le serveur

Dans le dossier du projet **MasterPlus** sur ton serveur, tu dois avoir :

* `package.json`
* `package-lock.json`
* `serveur/index.js`
* `serveur/routes/`
* `serveur/DataManager.js`
* `data/` (CSV 2023 / 2024 / 2025)
* `Dockerfile`
* `docker-compose.yml` (ou le service ajouté dans le tien)

---

## 2. Dockerfile minimal (obligatoire)

Dans le dossier du projet :

```Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "serveur/index.js"]
```

---

## 3. Service Docker à ajouter (ce que tu as presque déjà)

Dans ton `docker-compose.yml` principal :

```yaml
masterplus:
  build: ./masterplus
  container_name: masterplus
  restart: unless-stopped
  ports:
    - "127.0.0.1:3000:3000"
  volumes:
    - ./masterplus/data:/app/data
  environment:
    - NODE_ENV=production
```

⚠️ Important :

* **pas exposé publiquement**
* uniquement accessible par Nginx Proxy Manager

---

## 4. Lancer le site (une seule commande)

Depuis le dossier où se trouve `docker-compose.yml` :

```bash
docker compose build masterplus
docker compose up -d masterplus
```

---

## 5. Quand tu modifies le code JS (routes, DataManager…)

```bash
docker compose restart masterplus
```

---

## 6. Quand tu modifies uniquement les CSV (2025, etc.)

```bash
docker compose restart masterplus
```

Aucun rebuild nécessaire.

---

## 7. Accès au site

* En local serveur : `http://localhost:3000`
* Via domaine : **géré par Nginx Proxy Manager**

  * Forward vers `http://masterplus:3000`

---

## 8. Tu n’as RIEN d’autre à faire

* ❌ pas de build
* ❌ pas de nginx
* ❌ pas de php
* ❌ pas de sql

Ton site est **déjà prêt à être hébergé** tel quel.

---

Si tu veux, je peux te donner :

* la config exacte Nginx Proxy Manager (champ par champ)
* ou une checklist “ok pour soutenance / prod”
