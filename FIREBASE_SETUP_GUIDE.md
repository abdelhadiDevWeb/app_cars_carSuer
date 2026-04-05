# 🔥 Guide de Configuration Firebase pour Android

## ⚠️ Pourquoi Firebase est Nécessaire ?

Sur Android, Expo Push Notifications utilise **Firebase Cloud Messaging (FCM)** en interne pour obtenir le token push. C'est une limitation technique d'Expo - il n'y a pas de moyen de contourner cela.

**Cependant** : Une fois le token obtenu, vous pouvez utiliser uniquement **Expo Push Notification Service (EPNS)** pour envoyer les notifications depuis le backend, sans utiliser directement Firebase.

---

## 📋 Étapes de Configuration

### Étape 1 : Créer un Projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Add project" (Ajouter un projet)
3. Entrez le nom du projet : `CarSure` (ou un autre nom)
4. Désactivez Google Analytics (optionnel, pas nécessaire)
5. Cliquez sur "Create project"

### Étape 2 : Ajouter une App Android

1. Dans le projet Firebase, cliquez sur l'icône Android
2. **Package name** : `com.boojaaa.carsure` (doit correspondre à `app.json`)
3. **App nickname** : `CarSure Android` (optionnel)
4. Cliquez sur "Register app"

### Étape 3 : Télécharger google-services.json

1. Téléchargez le fichier `google-services.json`
2. Placez-le dans le dossier `app_car/` (à la racine du projet mobile)
3. Le fichier doit être : `app_car/google-services.json`

### Étape 4 : Mettre à jour app.json

Le fichier `app.json` doit référencer `google-services.json` :

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

**Note** : Cette ligne a été supprimée précédemment. Il faut la remettre pour que Firebase fonctionne.

### Étape 5 : Reconstruire l'APK

```bash
cd app_car
eas build -p android --profile preview
```

---

## ✅ Après Configuration

Une fois Firebase configuré :

1. ✅ Le token push sera obtenu sans erreur
2. ✅ Les notifications fonctionneront normalement
3. ✅ Le backend continuera d'utiliser uniquement EPNS (pas Firebase directement)
4. ✅ Firebase sera utilisé uniquement pour obtenir le token (transparent pour vous)

---

## 🔍 Vérification

Après avoir ajouté `google-services.json` et reconstruit l'APK :

- ✅ Plus d'erreur "Default FirebaseApp is not initialized"
- ✅ Le token push sera obtenu avec succès
- ✅ Les logs montreront : `✅ Push token saved to backend successfully`

---

## 📝 Notes Importantes

1. **Firebase est utilisé uniquement pour obtenir le token** : Une fois le token obtenu, votre backend utilise uniquement Expo Push Notification Service (EPNS) pour envoyer les notifications.

2. **Pas de coûts** : Firebase Cloud Messaging (FCM) est gratuit pour les notifications push.

3. **Sécurité** : Le fichier `google-services.json` contient des informations publiques (pas de secrets). Il est normal de le commiter dans Git.

4. **iOS** : iOS n'a pas besoin de Firebase - il utilise directement APNs (Apple Push Notification Service).

---

## 🚀 Alternative : Ignorer l'Erreur (Non Recommandé)

Si vous ne voulez vraiment pas configurer Firebase, vous pouvez :

1. Gérer l'erreur gracieusement dans le code
2. Les notifications fonctionneront toujours via Socket.IO quand l'app est ouverte
3. Mais les notifications push ne fonctionneront **pas** quand l'app est fermée sur Android

**Recommandation** : Configurez Firebase - c'est simple, gratuit, et nécessaire pour les notifications push sur Android.
