# Morgue de Sunagakure

Petit site de gestion d'une morgue : admissions, registre des défunts, autopsies, rapports et caissons.

## Structure

```
index.html        Tableau de bord
admission.html    Formulaire d'admission
registre.html     Registre des défunts (recherche, filtres, détail)
autopsies.html    Autopsies
rapports.html     Rapports
caissons.html     Occupation des caissons
style/style.css   Styles
assets/app.js     Logique du site
```

## Mettre le site en ligne avec GitHub Pages

1. Crée un dépôt sur GitHub et envoie-y tous ces fichiers (garde les dossiers `style` et `assets`).
2. Dans le dépôt : **Settings → Pages**.
3. Source : **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
4. Après une minute, le site est disponible à l'adresse `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.

## À savoir

Les données sont enregistrées dans le navigateur de chaque visiteur (`localStorage`). Elles restent sur l'appareil utilisé et ne sont pas partagées. Pour un registre commun à plusieurs personnes, il faudra ajouter une base de données.
