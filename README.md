# Muscu — carnet de musculation (PWA)

Application web de suivi de musculation, installable sur l'écran d'accueil, **100 % hors ligne**, avec des données qui restent **sur l'appareil**. Elle remplace un classeur Excel (Dashboard, Bibliothèque & Réglages, Journal des séances).

- **Stack** : Vite + TypeScript + Preact (+ signals), Chart.js chargé à la demande, IndexedDB, Web Crypto, vite-plugin-pwa (Workbox).
- **Aucun backend.** Le dépôt ne contient que du code : aucun mot de passe, aucune donnée, aucune clé.

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Installation locale](#installation-locale)
3. [Déploiement sur GitHub Pages](#déploiement-sur-github-pages)
4. [Installer l'app sur iPhone / Android](#installer-lapp-sur-iphone--android)
5. [Sauvegarder et restaurer](#sauvegarder-et-restaurer)
6. [Format d'import (CSV / JSON)](#format-dimport-csv--json)
7. [Données : stockage et limites](#données--stockage-et-limites)
8. [Calculs](#calculs)
9. [Structure du code](#structure-du-code)

---

## Fonctionnalités

- **Ouverture directe**, sans mot de passe : les données restent sur le téléphone. Mode démo dans Réglages → Données et mode démo.
- **Séance** : démarrage depuis un modèle (Haut A, Bas A, Haut B, Bas B pré-chargés), séries pré-remplies avec la dernière fois, référence « Dernière fois : 8 × 50 kg, RPE 8 », suggestion de double progression (jamais appliquée automatiquement), saisie à boutons +/- (pas 0,5 / 1 / 2,5 kg ou saisie libre), puces RPE 6-10, « Copier la précédente », série « non faite », superset, exercice sauté / ajouté / remplacé / réordonné, minuteur de repos non bloquant, écran maintenu allumé, sauvegarde continue (reprise exacte après fermeture).
- **Records personnels** détectés à la validation (1RM estimé, charge max, reps max à une charge).
- **Historique** filtrable (séance, exercice, période), chaque séance est modifiable (date, n° de semaine, séries).
- **Fiche exercice** : courbes de 1RM estimé, charge max et volume par séance, records, historique des séries et notes.
- **Tableau de bord** : sélecteur de semaine, volume de la semaine et cumulé, séances réalisées (entier, séances distinctes date + nom), taux plafonné à 100 % (« 5/4 · +1 en plus »), objectif de volume, volume hebdomadaire, records et progression du 1RM des mouvements suivis (au choix).
- **Corps** : poids et mensurations, une courbe par mesure, variation entre deux dates.
- **Réglages** : séances par semaine, date de début (semaine 1 = semaine du lundi au dimanche contenant cette date), objectif, deload toutes les N semaines, modèles éditables, bibliothèque (ajout, renommage, archivage, suppression, poids de corps, unilatéral, mode de calcul du volume), pas de charge par matériel, son / vibration / notification.
- **Sauvegarde** : export JSON (chiffré ou non), CSV par table (séparateur `;`, virgule décimale, ouvrable dans Excel), import avec aperçu et correction, rappel après 30 jours sans export.
- **Mode démo** : 10 semaines fictives, uniquement en mémoire, jamais mélangées aux vraies données.
- **Annuler / rétablir** (barre du haut), confirmation avant toute suppression, thème clair / sombre selon le système.

## Installation locale

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires (calculs, stockage, import)
npm run build      # build de production dans dist/
npm run preview    # sert dist/ en local
```

> Le service worker n'est actif que sur le build (`npm run build && npm run preview`).

## Déploiement sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` teste, construit et publie l'app à chaque push sur `main`. Le chemin de base est déduit automatiquement du nom du dépôt.

1. Crée un dépôt sur GitHub (public ou privé selon ton offre) et pousse le code sur la branche `main`.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Va dans l'onglet **Actions** et attends la fin du workflow « Déploiement GitHub Pages » (environ 1 minute).
4. L'app est en ligne à l'adresse `https://<utilisateur>.github.io/<depot>/`.

Chaque nouveau push redéploie l'app. Une fois ouverte, l'app propose « Nouvelle version disponible → Mettre à jour » : la mise à jour n'est jamais forcée, pour ne pas recharger en pleine séance.

## Installer l'app sur iPhone / Android

**iPhone (Safari obligatoire)**
1. Ouvre l'adresse de l'app dans **Safari**.
2. Touche le bouton **Partager** (carré avec une flèche), puis **Sur l'écran d'accueil**.
3. Lance l'app depuis l'icône : elle s'ouvre en plein écran et fonctionne hors ligne.

> Sur iPhone, utilise toujours l'icône de l'écran d'accueil. Les données de l'app installée sont séparées de celles de Safari, et iOS ne les efface pas automatiquement comme il peut le faire pour un site rarement visité.

**Android (Chrome)**
1. Ouvre l'adresse dans Chrome.
2. Menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).

**Limites propres à iOS** : pas de vibration. Le son de fin de repos est joué si l'app est à l'écran (et respecte le mode silencieux). Les notifications ne partent que si l'app est encore active en arrière-plan, car iOS suspend vite les apps web. Le minuteur reste exact au retour dans l'app, puisqu'il est calculé sur l'heure de fin.

## Sauvegarder et restaurer

**Sauvegarder** : Réglages → Sauvegarde et import → **Exporter (JSON chiffré)**. Choisis un mot de passe pour le fichier, puis « Enregistrer dans Fichiers » (iCloud Drive conseillé). Un rappel s'affiche sur l'accueil après 30 jours sans export.

**Restaurer / changer de téléphone** : installe l'app sur le nouvel appareil, puis Réglages → Sauvegarde et import → **Importer un fichier…** → choisis le `.json`. Saisis le mot de passe du fichier s'il est chiffré, puis confirme : la restauration **remplace** toutes les données.

**CSV** : les exports CSV (journal, séances, mensurations, bibliothèque) servent à analyser tes données dans Excel. Ils ne sont **pas chiffrés** et ne remplacent pas la sauvegarde JSON.

## Format d'import (CSV / JSON)

Import : Réglages → Sauvegarde et import → Importer un fichier. Un écran d'aperçu liste chaque problème avant validation. Rien n'est importé tant que tu n'as pas confirmé.

### Journal des séances (CSV)

- Encodage UTF-8. Séparateur `;` (recommandé), `,` ou tabulation : il est détecté automatiquement.
- Une ligne par série. 1re ligne = en-têtes (casse, accents et unités entre parenthèses ignorés).
- Les colonnes **Volume**, **1RM** et **Statut** sont ignorées si elles sont présentes : elles sont recalculées.

| Colonne | Obligatoire | Format | Exemple |
|---|---|---|---|
| Date | oui | JJ/MM/AAAA (ou AAAA-MM-JJ) | `02/11/2026` |
| Semaine | non | entier ; vide = calculée depuis la date de début | `2` |
| Séance | non | texte ; vide = « Séance importée » | `Haut A` |
| Exercice | oui | nom de la bibliothèque (casse et espaces ignorés) | `Squat barre` |
| Série | non | entier ; vide ou doublon = renuméroté | `1` |
| Reps prévues | non | texte | `5-8` |
| Reps réalisées | non | entier ; vide ou 0 = série « non faite » | `8` |
| Charge (kg) | non | virgule ou point décimal ; vide = poids de corps | `11,3` |
| RPE | non | 6 à 10 (demi-points acceptés) | `8` |
| Notes | non | texte | `mal à la nuque` |

Exemple complet : [`docs/exemple-journal.csv`](docs/exemple-journal.csv)

```csv
Date;Semaine;Séance;Exercice;Série;Reps prévues;Reps réalisées;Charge (kg);RPE;Notes
02/11/2026;2;Haut A;Développé couché barre;1;5-8;8;60;8;
02/11/2026;2;Haut A;Face pull;1;15;15;11,3;8;
03/11/2026;2;Bas A;Squat barre;1;5-8;8;50;8;mal à la nuque à cause de la barre
03/11/2026;2;Bas A;Soulevé de terre roumain;1;8-10;;60;;douleur dans le dos, j'arrête les jambes
03/11/2026;2;Bas A;Circuit Abdos;;;;;;fait
```

**Erreurs tolérées et signalées** :

| Cas | Traitement |
|---|---|
| Ligne vide | ignorée (comptée) |
| Date `05.09/2026`, `12/010/2026` | corrigée automatiquement (05/09/2026, 12/10/2026), signalée « à vérifier » |
| Date manquante ou illisible (`xx`) | **erreur** : correction manuelle, bouton « Reprendre la date de la ligne précédente », ou ligne ignorée |
| RPE invalide (`abc`, `12`) | ignoré, corrigeable dans l'aperçu |
| N° de série en double | renuméroté |
| Reps vides ou 0 | importée comme série « non faite » (ne compte ni dans le volume ni dans le 1RM) |
| Exercice inconnu | à associer à un exercice existant, ou créé dans le groupe « Importés » (en bloc « à cocher » s'il n'a aucune valeur chiffrée) |
| Séance déjà présente (même date et même nom) | ignorée : réimporter le même fichier ne crée pas de doublons |

Les lignes d'une même date et d'une même séance forment une séance. Si la colonne Semaine diffère de la semaine calculée, elle est conservée comme **correction manuelle** : les agrégats suivent le numéro saisi, comme dans l'Excel.

### Journal des séances (JSON)

Un tableau d'objets aux mêmes clés que le CSV (ou `{ "rows": [...] }`) :

```json
[
  { "Date": "02/11/2026", "Semaine": 2, "Séance": "Haut A", "Exercice": "Squat barre",
    "Série": 1, "Reps réalisées": 8, "Charge (kg)": 50, "RPE": 8, "Notes": "" }
]
```

### Mensurations (CSV)

Détection automatique quand les colonnes Poids et Taille sont présentes sans colonne Exercice. Exemple : [`docs/exemple-mensurations.csv`](docs/exemple-mensurations.csv)

```csv
Date;Poids (kg);Tour de taille (cm);Tour de bras (cm);Tour de cuisse (cm);Tour de poitrine (cm);Notes
01/11/2026;78,4;84;34;58;101;Début du programme
```

**Conseil pour exporter depuis Excel** : *Fichier → Enregistrer sous → CSV UTF-8 (délimité par des points-virgules)*, une feuille à la fois.

## Données : stockage et limites

**Fonctionnement**
- L'app s'ouvre directement, sans mot de passe. Les données sont enregistrées en continu dans le stockage local de l'app (IndexedDB), **uniquement sur l'appareil**. Rien n'est envoyé sur internet.
- Le dépôt GitHub ne contient que le code : aucune donnée, aucun mot de passe, aucune clé.
- L'export JSON peut être chiffré par un mot de passe propre au fichier (AES-GCM 256, clé dérivée par PBKDF2-SHA256, 600 000 itérations, sel aléatoire).

**Limites**
- La protection repose sur le code de verrouillage du téléphone : quiconque a le téléphone déverrouillé peut lire l'app.
- **Pas de synchronisation** entre appareils : il faut passer par export puis import.
- Téléphone perdu, app supprimée ou stockage effacé = données perdues, sauf sauvegarde récente.
- Les exports CSV et JSON non chiffrés sont lisibles par n'importe qui.

**Anciennes versions** : la première version chiffrait les données avec un mot de passe demandé à chaque ouverture. Si un tel coffre est présent, l'app demande ce mot de passe **une seule fois** pour convertir les données, puis ne le redemande plus. Sans lui, on peut repartir de zéro et restaurer une sauvegarde JSON.

**Piste pour une version 2 : synchronisation via Supabase** (à discuter avant toute implémentation). Authentification email + mot de passe Supabase, et données chiffrées **côté client** avant l'envoi, pour que le serveur ne voie que du contenu chiffré. Le modèle de données (un seul document) s'y prête directement.

## Calculs

| Indicateur | Règle |
|---|---|
| Volume d'une série | reps réalisées × charge (×2 si exercice unilatéral) |
| 1RM estimé | charge × (1 + reps / 30) (Epley) |
| Série comptée | validée, reps > 0 et charge > 0 ; sinon aucune valeur (pas de 0 parasite) |
| Poids de corps | par exercice : volume « reps × lest », « reps × (poids de corps + lest) » (dernier poids connu à la date) ou « pas de volume » |
| Semaine | numéro corrigé de la séance, sinon `semaine 1 = semaine (lundi → dimanche) contenant la date de début` |
| Séances réalisées | nombre de couples distincts (date, nom de séance) ayant au moins une série réalisée (ou un bloc coché) |
| Taux de réalisation | min(100 %, réalisées / prévues), affiché « 3/4 » ; le surplus est indiqué à part |
| 1RM de la semaine | meilleur 1RM estimé de la semaine ; les semaines sans données ne tracent pas de zéro |
| Double progression | toutes les séries prévues au haut de la fourchette → +2,5 kg (barre), +1 à 2 kg par haltère, +1 palier (machine / poulie), repartir au bas de la fourchette |
| Deload | proposé quand `semaine − dernier deload ≥ N` (7 par défaut) ; options « charges à ~60 % » ou « moitié des séries » |

Exemples vérifiés par les tests : 8 × 20 kg → 160 kg / 25,33 kg, 8 × 50 kg → 400 kg / 63,33 kg, 15 × 11,3 kg → 169,5 kg / 16,95 kg.

> Le 01/11/2026 tombant un dimanche, la semaine 1 va du 26/10 au 01/11 et le lundi 02/11 commence la semaine 2. Pour qu'une séance du 02/11 soit en semaine 1, règle la date de début au 02/11/2026 (Réglages → Programme).

## Structure du code

```
src/
  domain/    types, formats FR, calculs purs (volume, 1RM, agrégats, PR, progression, deload), création de séance
  crypto/    primitives Web Crypto
  db/        stockage IndexedDB, sauvegardes et exports CSV
  import/    analyse CSV / JSON tolérante
  seed/      bibliothèque + programme Upper / Lower, données de démo
  ui/        état (signals, annuler / rétablir), routeur, écrans et composants
tests/       Vitest : calculs, stockage, chiffrement des exports, import
```
