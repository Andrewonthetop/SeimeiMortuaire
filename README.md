# Morgue de Sunagakure

Site de gestion d'une morgue : admissions, registre des défunts, autopsies, rapports et caissons.

Quand Firebase est configuré, **tout le monde voit les mêmes données en direct** : une admission ajoutée sur un appareil apparaît tout de suite chez les autres, sans recharger la page. Sans configuration, le site marche quand même, mais les données restent dans le navigateur de chacun.

## Fichiers

```
index.html                Tableau de bord
admission.html            Formulaire d'admission
registre.html             Registre des défunts (recherche, filtres, détail)
autopsies.html            Autopsies
rapports.html             Rapports
caissons.html             Occupation des caissons
style/style.css           Styles
assets/app.js             Logique du site
assets/firebase-config.js Configuration de la base partagée (à remplir, étape 3)
```

## Mise en place (environ 10 minutes)

### 1. Créer le projet Firebase

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. **Ajouter un projet**, donne-lui un nom (par exemple `morgue-suna`).
3. Désactive Google Analytics (inutile ici), puis **Créer le projet**.

### 2. Créer la base de données

1. Dans le menu de gauche : **Build → Firestore Database → Créer une base de données**.
2. Choisis un emplacement proche (par exemple `eur3 (europe)`).
3. Choisis le mode **test**, puis **Activer**. Les règles définitives sont à l'étape 4.

### 3. Relier le site à la base

1. Clique sur la roue dentée en haut à gauche, puis **Paramètres du projet**.
2. Dans **Vos applications**, clique sur l'icône web `</>`, donne un nom, puis **Enregistrer l'application** (ne coche pas Firebase Hosting).
3. Firebase affiche un bloc `firebaseConfig = { apiKey: "...", ... }`. Copie l'objet entre accolades.
4. Ouvre `assets/firebase-config.js` et remplace `window.FIREBASE_CONFIG = null;` par :

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

La clé `apiKey` de Firebase n'est pas un mot de passe : elle peut être publiée sur GitHub. Ce sont les règles de l'étape 4 qui protègent la base.

### 4. Règles de la base

1. **Firestore Database → onglet Règles**.
2. Remplace tout le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Clique sur **Publier**.

### 5. Mettre le site en ligne sur GitHub Pages

1. Crée un dépôt sur GitHub et envoie-y tous les fichiers, en gardant les dossiers `style` et `assets`.
2. **Settings → Pages**.
3. Source : **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Après une minute, le site est disponible sur `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.

### 6. Vérifier

Ouvre le site sur deux appareils (ou deux onglets), ajoute une admission sur l'un : elle doit apparaître sur l'autre. Le badge en haut à droite affiche **Registre partagé en direct** quand la base est bien connectée. S'il affiche **Données sur cet appareil**, la configuration de l'étape 3 n'est pas lue.

## À savoir

- **Accès** : avec les règles de l'étape 4, toute personne qui connaît l'adresse du site peut lire et modifier les dossiers. Ne diffuse l'adresse qu'aux personnes concernées. Pour limiter l'accès à certains comptes, il faut ajouter une connexion (Firebase Authentication).
- **Numéros et caissons** : les numéros d'admission (ADM-0001, ADM-0002…) sont attribués par la base. Deux personnes qui enregistrent en même temps n'auront jamais le même numéro, ni le même caisson.
- **Coût** : l'offre gratuite de Firebase (Spark) suffit largement pour ce site.
- **Supprimer les exemples** : le bouton « Charger 3 exemples » du tableau de bord crée des dossiers de démonstration. Supprime-les un par un depuis le registre.

## Si ça ne marche pas

- **Le badge reste sur « Ouverture… » et les listes sont vides** : le fichier `assets/app.js` ne se charge pas. Vérifie sur GitHub que le dossier `assets` contient bien `app.js` et `firebase-config.js`, avec ces noms exacts (minuscules). Appuie sur `F12`, onglet **Console** : l'erreur s'y affiche.
- **Le badge affiche « Données sur cet appareil »** : la configuration n'est pas lue ou Firebase est injoignable. Vérifie que `assets/firebase-config.js` commence bien par `window.FIREBASE_CONFIG = {`.
- **Message « Écriture refusée »** : les règles de l'étape 4 ne sont pas publiées.
- **Après une mise à jour des fichiers sur GitHub**, attends une minute puis recharge la page avec `Ctrl + F5`.
