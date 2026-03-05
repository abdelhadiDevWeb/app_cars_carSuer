# Configuration des variables d'environnement

## Fichier .env

Le fichier `.env` contient l'URL du backend. Pour modifier l'URL du backend, éditez le fichier `.env` dans le dossier `app_car/`.

### Format du fichier .env

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

### Variables disponibles

- `EXPO_PUBLIC_BACKEND_URL` : URL du serveur backend (par défaut: http://localhost:8001)

### Important

1. **Redémarrer le serveur Expo** : Après avoir modifié le fichier `.env`, vous devez redémarrer le serveur Expo pour que les changements prennent effet.
   ```bash
   # Arrêtez le serveur (Ctrl+C) puis relancez-le
   npm start
   # ou
   npx expo start --clear
   ```

2. **Préfixe EXPO_PUBLIC_** : Toutes les variables d'environnement doivent commencer par `EXPO_PUBLIC_` pour être accessibles dans l'application React Native/Expo.

3. **Le fichier .env est ignoré par Git** : Le fichier `.env` est dans `.gitignore` pour éviter de committer des informations sensibles. Utilisez `.env.example` comme modèle.

### Exemples d'URL

- **Développement local** : `http://localhost:8001`
- **Réseau local** : `http://192.168.1.100:8001` (remplacez par l'IP de votre machine)
- **Production** : `https://api.votredomaine.com`

### Utilisation dans le code

L'URL du backend est automatiquement utilisée dans toutes les requêtes API via la fonction `apiRequest()` dans `utils/backend.ts`. Tous les endpoints sont automatiquement préfixés avec `/api`.

Exemple :
```typescript
import { apiRequest } from '@/utils/backend';

// Cette requête sera envoyée à: http://localhost:8001/api/auth/login
const response = await apiRequest('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
```
