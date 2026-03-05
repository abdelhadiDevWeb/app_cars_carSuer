# Configuration de la connexion Backend pour React Native/Expo

## Problème : "Network request failed"

L'erreur "Network request failed" se produit généralement parce que l'app mobile ne peut pas se connecter au backend lorsque vous utilisez `localhost` dans l'URL.

### Pourquoi `localhost` ne fonctionne pas ?

- **Sur un appareil physique** : `localhost` fait référence à l'appareil lui-même, pas à votre ordinateur
- **Sur un émulateur Android** : `localhost` ne fonctionne pas, il faut utiliser `10.0.2.2`
- **Sur un simulateur iOS** : `localhost` devrait fonctionner, mais parfois il faut utiliser l'IP locale

## Solutions selon votre environnement

### 1. Appareil physique (Android/iOS)

Utilisez l'**IP locale** de votre ordinateur sur le réseau WiFi.

#### Trouver votre IP locale :

**Windows :**
```powershell
ipconfig | Select-String -Pattern "IPv4"
```

**Mac/Linux :**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Exemple :** Si votre IP est `192.168.1.100`, utilisez :
```
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.100:8001
```

**Important :** Votre téléphone et votre ordinateur doivent être sur le **même réseau WiFi**.

### 2. Émulateur Android

Pour l'émulateur Android, utilisez l'adresse spéciale `10.0.2.2` qui pointe vers `localhost` de votre machine hôte :

```
EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8001
```

### 3. Simulateur iOS

Pour le simulateur iOS, `localhost` devrait fonctionner, mais si ce n'est pas le cas, utilisez votre IP locale :

```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
# ou
EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8001
```

### 4. Production

Pour la production, utilisez l'URL complète de votre serveur :

```
EXPO_PUBLIC_BACKEND_URL=https://api.votredomaine.com
```

## Configuration actuelle

Votre fichier `.env` dans `app_car/.env` contient :

```
EXPO_PUBLIC_BACKEND_URL=http://10.231.46.40:8001
```

Cette IP correspond à votre machine sur le réseau local.

## Vérifications

1. **Vérifiez que le backend est démarré** :
   ```bash
   cd server_bun
   bun run dev
   ```

2. **Vérifiez que le backend écoute sur toutes les interfaces** :
   Le backend doit écouter sur `0.0.0.0:8001` et non seulement `localhost:8001`

3. **Vérifiez le firewall** :
   Assurez-vous que le port 8001 n'est pas bloqué par le firewall Windows

4. **Redémarrez Expo après modification du .env** :
   ```bash
   npx expo start --clear
   ```

## Test de connexion

Pour tester si le backend est accessible depuis votre appareil :

1. Ouvrez un navigateur sur votre téléphone
2. Accédez à : `http://VOTRE_IP:8001/api/health` (si cette route existe)
3. Si vous voyez une réponse, la connexion fonctionne

## Dépannage

### Erreur persistante "Network request failed"

1. Vérifiez que le backend tourne : `http://localhost:8001` dans votre navigateur
2. Vérifiez que vous êtes sur le même réseau WiFi
3. Vérifiez le firewall Windows
4. Essayez de redémarrer Expo avec `--clear`
5. Vérifiez les logs du backend pour voir si les requêtes arrivent

### L'IP change souvent

Si votre IP locale change souvent (DHCP), vous pouvez :
- Configurer une IP statique sur votre machine
- Utiliser un service comme `ngrok` pour créer un tunnel
- Utiliser l'émulateur Android avec `10.0.2.2` qui est toujours stable
