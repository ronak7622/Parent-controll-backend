export interface LocalizedText {
  en: string;
  hi?: string;
  gu?: string;
  es?: string;
  fr?: string;
}

export interface PermissionGuideRule {
  title: LocalizedText;
  steps: LocalizedText[];
  imageUrl?: string;
  gifUrl?: string;
  deepLinkIntent?: string;
  requiredLevel?: string;
  warningNotice?: LocalizedText;
}

export type PermissionGuideTree = {
  [permissionKey: string]: {
    [brandKey: string]: {
      [sdkRange: string]: PermissionGuideRule;
    };
  };
};

export const DEFAULT_PERMISSION_GUIDES: PermissionGuideTree = {
  LOCATION: {
    generic: {
      '>=33': {
        title: {
          en: 'Location Access (All the time)',
          hi: 'स्थान पहुंच (हर समय अनुमति दें)',
          gu: 'લોકેશન ઍક્સેસ (હંમેશા પરવાનગી આપો)',
          es: 'Acceso a la ubicación (Todo el tiempo)',
          fr: 'Accès à la localisation (Tout le temps)',
        },
        steps: [
          {
            en: "Tap 'Allow Location' below.",
            hi: "'स्थान की अनुमति दें' पर टैप करें।",
            gu: "'લોકેશનની મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' abajo.",
            fr: "Appuyez sur 'Autoriser la localisation' ci-dessous.",
          },
          {
            en: "Select 'Allow all the time' (Mandatory for 24/7 child safety tracking).",
            hi: "'हर समय अनुमति दें' चुनें (24/7 सुरक्षा ट्रैकिंग के लिए अनिवार्य)।",
            gu: "'હંમેશા પરવાનગી આપો' પસંદ કરો (24/7 બાળ સુરક્ષા માટે ફરજિયાત).",
            es: "Selecciona 'Permitir todo el tiempo' (Obligatorio para protección 24/7).",
            fr: "Sélectionnez 'Toujours autoriser' (Requis pour la sécurité 24h/24).",
          },
          {
            en: "Ensure 'Use precise location' is enabled.",
            hi: "सुनिश्चित करें कि 'सटीक स्थान का उपयोग करें' सक्षम है।",
            gu: "ખાતરી કરો કે 'ચોક્કસ સ્થાનનો ઉપયોગ કરો' ચાલુ છે.",
            es: "Asegúrate de activar 'Usar ubicación precisa'.",
            fr: "Assurez-vous que 'Position exacte' est activée.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
        warningNotice: {
          en: "'While using the app' is not sufficient. Select 'Allow all the time' to proceed.",
          hi: "'केवल ऐप उपयोग करते समय' पर्याप्त नहीं है। आगे बढ़ने के लिए 'हर समय अनुमति दें' चुनें।",
          gu: "'માત્ર ઍપ ઉપયોગ કરતી વખતે' પૂરતું નથી. આગળ વધવા 'હંમેશા પરવાનગી આપો' પસંદ કરો.",
          es: "'Solo mientras la app está en uso' no es suficiente. Selecciona 'Permitir todo el tiempo'.",
          fr: "'Uniquement si l'appli est utilisée' ne suffit pas. Choisissez 'Toujours autoriser'.",
        },
      },
      '30-32': {
        title: {
          en: 'Location Access (All the time)',
          hi: 'स्थान पहुंच (हर समय)',
          gu: 'લોકેશન ઍક્સેસ (હંમેશા)',
          es: 'Acceso a la ubicación (Todo el tiempo)',
          fr: 'Accès à la localisation (Tout le temps)',
        },
        steps: [
          {
            en: "Tap 'Allow Location' below to open Permissions.",
            hi: "अनुमतियां खोलने के लिए नीचे 'स्थान की अनुमति दें' पर टैप करें।",
            gu: "પરવાનગીઓ ખોલવા માટે નીચે 'લોકેશનની મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' para abrir Permisos.",
            fr: "Appuyez sur 'Autoriser la localisation' pour ouvrir les autorisations.",
          },
          {
            en: "Tap 'Permissions' -> 'Location'.",
            hi: "'अनुमतियां' -> 'स्थान' पर टैप करें।",
            gu: "'પરવાનગીઓ' -> 'લોકેશન' પર ટૅપ કરો.",
            es: "Toca 'Permisos' -> 'Ubicación'.",
            fr: "Appuyez sur 'Autorisations' -> 'Localisation'.",
          },
          {
            en: "Change permission to 'Allow all the time'.",
            hi: "अनुमति बदलकर 'हर समय अनुमति दें' करें।",
            gu: "પરવાનગી બદલીને 'હંમેશા પરવાનગી આપો' કરો.",
            es: "Cambia el permiso a 'Permitir todo el tiempo'.",
            fr: "Passez l'autorisation sur 'Toujours autoriser'.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
      },
      '*': {
        title: {
          en: 'Location Access',
          hi: 'स्थान पहुंच',
          gu: 'લોકેશન ઍક્સેસ',
          es: 'Acceso a la ubicación',
          fr: 'Accès à la localisation',
        },
        steps: [
          {
            en: "Tap 'Allow Location' below.",
            hi: "'स्थान की अनुमति दें' पर टैप करें।",
            gu: "'લોકેશનની મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' abajo.",
            fr: "Appuyez sur 'Autoriser la localisation'.",
          },
          {
            en: "Select 'Allow' / 'Allow all the time' on the prompt.",
            hi: "स्क्रीन पर 'अनुमति दें' / 'हर समय अनुमति दें' चुनें।",
            gu: "પ્રોમ્પ્ટ પર 'મંજૂરી આપો' / 'હંમેશા પરવાનગી આપો' પસંદ કરો.",
            es: "Selecciona 'Permitir' / 'Permitir todo el tiempo'.",
            fr: "Sélectionnez 'Autoriser' ou 'Toujours autoriser'.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
      },
    },
    samsung: {
      '>=33': {
        title: {
          en: 'Samsung Location (Allow all the time)',
          hi: 'सैमसंग स्थान अनुमति (हर समय अनुमति दें)',
          gu: 'સેમસંગ લોકેશન (હંમેશા પરવાનગી આપો)',
          es: 'Ubicación Samsung (Permitir todo el tiempo)',
          fr: 'Localisation Samsung (Toujours autoriser)',
        },
        steps: [
          {
            en: "Tap 'Allow Location' to open Samsung App Settings.",
            hi: "सैमसंग ऐप सेटिंग्स खोलने के लिए 'स्थान अनुमति दें' पर टैप करें।",
            gu: "સેમસંગ ઍપ સેટિંગ્સ ખોલવા 'લોકેશનની મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' para abrir Ajustes de Samsung.",
            fr: "Appuyez sur 'Autoriser la localisation' pour ouvrir les paramètres Samsung.",
          },
          {
            en: "Tap 'Permissions' -> 'Location'.",
            hi: "'अनुमतियां' -> 'स्थान' पर टैप करें।",
            gu: "'પરવાનગીઓ' -> 'લોકેશન' પર ટૅપ કરો.",
            es: "Toca 'Permisos' -> 'Ubicación'.",
            fr: "Appuyez sur 'Autorisations' -> 'Localisation'.",
          },
          {
            en: "Select 'Allow all the time' and enable 'Use precise location'.",
            hi: "'हर समय अनुमति दें' चुनें और 'सटीक स्थान का उपयोग करें' चालू करें।",
            gu: "'હંમેશા પરવાનગી આપો' પસંદ કરો અને 'ચોક્કસ લોકેશન' ચાલુ કરો.",
            es: "Selecciona 'Permitir todo el tiempo' y activa 'Ubicación exacta'.",
            fr: "Sélectionnez 'Toujours autoriser' et activez 'Position exacte'.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
      },
      '*': {
        title: {
          en: 'Samsung Location Access',
          hi: 'सैमसंग स्थान पहुंच',
          gu: 'સેમસંગ લોકેશન ઍક્સેસ',
          es: 'Acceso a ubicación en Samsung',
          fr: 'Accès localisation Samsung',
        },
        steps: [
          {
            en: "Tap 'Allow Location' below.",
            hi: "नीचे 'स्थान अनुमति दें' पर टैप करें।",
            gu: "નીચે 'લોકેશન મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' abajo.",
            fr: "Appuyez sur 'Autoriser la localisation'.",
          },
          {
            en: "Select 'Allow all the time' in Samsung Location Settings.",
            hi: "सैमसंग सेटिंग्स में 'हर समय अनुमति दें' चुनें।",
            gu: "સેમસંગ સેટિંગ્સમાં 'હંમેશા પરવાનગી આપો' પસંદ કરો.",
            es: "Selecciona 'Permitir todo el tiempo' en los ajustes de Samsung.",
            fr: "Sélectionnez 'Toujours autoriser' dans les paramètres Samsung.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
      },
    },
    xiaomi: {
      '*': {
        title: {
          en: 'Xiaomi/Redmi Location Access',
          hi: 'शाओमी/रेडमी स्थान अनुमति',
          gu: 'શાઓમી/રેડમી લોકેશન ઍક્સેસ',
          es: 'Ubicación Xiaomi/Redmi',
          fr: 'Localisation Xiaomi/Redmi',
        },
        steps: [
          {
            en: "Tap 'Allow Location' below.",
            hi: "नीचे 'स्थान अनुमति दें' पर टैप करें।",
            gu: "નીચે 'લોકેશન મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'Permitir ubicación' abajo.",
            fr: "Appuyez sur 'Autoriser la localisation'.",
          },
          {
            en: "Select 'Allow all the time' in MIUI / HyperOS permission manager.",
            hi: "MIUI / HyperOS अनुमति प्रबंधक में 'हर समय अनुमति दें' चुनें।",
            gu: "MIUI / HyperOS પરવાનગી મેનેજરમાં 'હંમેશા પરવાનગી આપો' પસંદ કરો.",
            es: "Selecciona 'Permitir todo el tiempo' en el gestor de permisos de MIUI.",
            fr: "Sélectionnez 'Toujours autoriser' dans le gestionnaire MIUI.",
          },
        ],
        requiredLevel: 'background',
        deepLinkIntent: 'LOCATION_SETTINGS',
      },
    },
  },
  ACCESSIBILITY: {
    generic: {
      '>=33': {
        title: {
          en: 'Accessibility Service (Android 13+)',
          hi: 'एक्सेसिबिलिटी सेवा (एंड्रॉइड 13+)',
          gu: 'ઍક્સેસિબિલિટી સેવા (Android 13+)',
          es: 'Servicio de accesibilidad (Android 13+)',
          fr: 'Service d’accessibilité (Android 13+)',
        },
        steps: [
          {
            en: "CRITICAL: If 'Restricted setting' appears, open App Info -> tap 3 dots (⋮) top right -> 'Allow restricted settings' -> verify PIN.",
            hi: "अति महत्वपूर्ण: यदि 'Restricted setting' दिखे, तो ऐप जानकारी खोलें -> ऊपर 3 डॉट्स (⋮) -> 'प्रतिबंधित सेटिंग्स की अनुमति दें' -> पिन दर्ज करें।",
            gu: "મહત્વપૂર્ણ: જો 'Restricted setting' દેખાય, તો ઍપ ઇન્ફો ખોલો -> ઉપર 3 બિંદુઓ (⋮) -> 'પ્રતિબંધિત સેટિંગ્સની મંજૂરી આપો' -> પિન દાખલ કરો.",
            es: "IMPORTANTE: Si aparece 'Ajuste restringido', ve a Información de app -> toca 3 puntos (⋮) arriba -> 'Permitir ajustes restringidos' -> verifica PIN.",
            fr: "IMPORTANT : Si 'Paramètre restreint' s'affiche, allez dans Infos appli -> 3 points (⋮) en haut -> 'Autoriser les paramètres restreints' -> confirmez le code.",
          },
          {
            en: "Tap 'Proceed to Settings' below to open Accessibility.",
            hi: "एक्सेसिबिलिटी खोलने के लिए नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "ઍક્સેસિબિલિટી ખોલવા માટે નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo para abrir Accesibilidad.",
            fr: "Appuyez sur 'Aller aux paramètres' ci-dessous pour ouvrir l'accessibilité.",
          },
          {
            en: "Find 'Child Protect' under Installed / Downloaded Apps.",
            hi: "'इंस्टॉल की गई ऐप्स' में 'Child Protect' खोजें।",
            gu: "'ઇન્સ્ટૉલ કરેલી ઍપ્સ' માં 'Child Protect' શોધો.",
            es: "Busca 'Child Protect' en Aplicaciones instaladas / descargadas.",
            fr: "Trouvez 'Child Protect' dans les applications téléchargées.",
          },
          {
            en: "Turn ON the switch and tap 'Allow'.",
            hi: "स्विच चालू करें और 'अनुमति दें' पर टैप करें।",
            gu: "સ્વિચ ચાલુ કરો અને 'મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Activa el interruptor y toca 'Permitir'.",
            fr: "Activez l'interrupteur et appuyez sur 'Autoriser'.",
          },
        ],
        deepLinkIntent: 'ACCESSIBILITY_SETTINGS',
      },
      '*': {
        title: {
          en: 'Enable Accessibility Service',
          hi: 'एक्सेसिबिलिटी सेवा सक्षम करें',
          gu: 'ઍક્સેસિબિલિટી સેવા ચાલુ કરો',
          es: 'Activar servicio de accesibilidad',
          fr: 'Activer le service d’accessibilité',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' below.",
            hi: "नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo.",
            fr: "Appuyez sur 'Aller aux paramètres' ci-dessous.",
          },
          {
            en: "Find 'Child Protect' under Installed Apps.",
            hi: "'इंस्टॉल की गई ऐप्स' में 'Child Protect' खोजें।",
            gu: "'ઇન્સ્ટૉલ કરેલી ઍપ્સ' માં 'Child Protect' શોધો.",
            es: "Busca 'Child Protect' en Aplicaciones instaladas.",
            fr: "Trouvez 'Child Protect' dans Applications installées.",
          },
          {
            en: "Turn ON Accessibility switch and tap OK.",
            hi: "स्विच चालू करें और ठीक है पर टैप करें।",
            gu: "સ્વિચ ચાલુ કરો અને ઠીક પર ટૅપ કરો.",
            es: "Activa el interruptor y confirma con Aceptar.",
            fr: "Activez l'interrupteur et confirmez.",
          },
        ],
        deepLinkIntent: 'ACCESSIBILITY_SETTINGS',
      },
    },
    xiaomi: {
      '>=33': {
        title: {
          en: 'Xiaomi Accessibility & Restricted Settings',
          hi: 'शाओमी एक्सेसिबिलिटी और प्रतिबंधित सेटिंग्स',
          gu: 'શાઓમી ઍક્સેસિબિલિટી અને પ્રતિબંધિત સેટિંગ્સ',
          es: 'Accesibilidad Xiaomi y ajustes restringidos',
          fr: 'Accessibilité Xiaomi et paramètres restreints',
        },
        steps: [
          {
            en: "MIUI / HyperOS: If blocked, open App Info -> 3 dots (⋮) -> 'Allow restricted settings'.",
            hi: "MIUI / HyperOS: यदि अवरुद्ध है, तो ऐप जानकारी -> 3 डॉट्स (⋮) -> 'प्रतिबंधित सेटिंग्स की अनुमति दें' खोलें।",
            gu: "MIUI / HyperOS: જો અવરોધિત હોય, તો ઍપ ઇન્ફો -> 3 બિંદુઓ (⋮) -> 'પ્રતિબંધિત સેટિંગ્સની મંજૂરી આપો' કરો.",
            es: "MIUI / HyperOS: Si está bloqueado, abre Info de app -> 3 puntos (⋮) -> 'Permitir ajustes restringidos'.",
            fr: "MIUI / HyperOS : Si bloqué, allez dans Infos appli -> 3 points (⋮) -> 'Autoriser paramètres restreints'.",
          },
          {
            en: "Tap 'Proceed to Settings' -> 'Downloaded Apps' -> 'Child Protect'.",
            hi: "'सेटिंग्स पर जाएं' -> 'डाउनलोड की गई ऐप्स' -> 'Child Protect' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' -> 'ડાઉનલોડ કરેલી ઍપ્સ' -> 'Child Protect' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' -> 'Apps descargadas' -> 'Child Protect'.",
            fr: "Appuyez sur 'Paramètres' -> 'Services téléchargés' -> 'Child Protect'.",
          },
          {
            en: "Turn ON switch, wait 10s countdown, check checkbox & tap OK.",
            hi: "स्विच ऑन करें, 10 सेकंड प्रतीक्षा करें, चेकबॉक्स टिक करें और ओके दबाएं।",
            gu: "સ્વિચ ચાલુ કરો, 10 સેકન્ડ રાહ જુઓ, ચેકબૉક્સ ટિક કરો અને ઓકે દબાવો.",
            es: "Activa el interruptor, espera 10s, marca la casilla y toca Aceptar.",
            fr: "Activez le bouton, attendez 10s, cochez la case et appuyez sur OK.",
          },
        ],
        deepLinkIntent: 'ACCESSIBILITY_SETTINGS',
      },
    },
  },
  NOTIFICATION_ACCESS: {
    generic: {
      '>=33': {
        title: {
          en: 'Notification Listener (Android 13+)',
          hi: 'सूचना श्रोता (एंड्रॉइड 13+)',
          gu: 'સૂચના સાંભળનાર (Android 13+)',
          es: 'Acceso a notificaciones (Android 13+)',
          fr: 'Accès aux notifications (Android 13+)',
        },
        steps: [
          {
            en: "If grayed out, enable 'Allow restricted settings' in App info first.",
            hi: "यदि विकल्प धूसर है, तो पहले ऐप जानकारी में 'प्रतिबंधित सेटिंग्स की अनुमति दें' सक्षम करें।",
            gu: "જો વિકલ્પ ઝાંખો હોય, તો પહેલાં ઍપ ઇન્ફોમાં 'પ્રતિબંધિત સેટિંગ્સની મંજૂરી આપો' ચાલુ કરો.",
            es: "Si aparece atenuado, activa primero 'Permitir ajustes restringidos' en Información de la app.",
            fr: "Si l'option est grisée, autorisez d'abord les 'Paramètres restreints' dans Infos appli.",
          },
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Find 'Child Protect' in Notification Access list and turn ON.",
            hi: "अधिसूचना पहुंच सूची में 'Child Protect' खोजें और चालू करें।",
            gu: "નોટિફિકેશન ઍક્સેસ લિસ્ટમાં 'Child Protect' શોધો અને ચાલુ કરો.",
            es: "Busca 'Child Protect' en la lista y actívalo.",
            fr: "Trouvez 'Child Protect' dans la liste et activez-le.",
          },
        ],
        deepLinkIntent: 'NOTIFICATION_LISTENER_SETTINGS',
      },
      '*': {
        title: {
          en: 'Notification Access',
          hi: 'अधिसूचना पहुंच',
          gu: 'નોટિફિકેશન ઍક્સેસ',
          es: 'Acceso a notificaciones',
          fr: 'Accès aux notifications',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Locate 'Child Protect' and turn ON the switch.",
            hi: "'Child Protect' ढूंढें और स्विच चालू करें।",
            gu: "'Child Protect' શોધો અને સ્વિચ ચાલુ કરો.",
            es: "Busca 'Child Protect' y activa el interruptor.",
            fr: "Cherchez 'Child Protect' et activez l'interrupteur.",
          },
        ],
        deepLinkIntent: 'NOTIFICATION_LISTENER_SETTINGS',
      },
    },
  },
  USAGE_ACCESS: {
    generic: {
      '*': {
        title: {
          en: 'Permit Usage Access',
          hi: 'उपयोग पहुंच की अनुमति दें',
          gu: 'વપરાશ ઍક્સેસની મંજૂરી આપો',
          es: 'Permitir acceso de uso',
          fr: 'Autoriser l’accès aux données d’utilisation',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' below.",
            hi: "नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Find and tap 'Child Protect' in the list.",
            hi: "सूची में 'Child Protect' ढूंढें और उस पर टैप करें।",
            gu: "સૂચિમાં 'Child Protect' શોધો અને તેના પર ટૅપ કરો.",
            es: "Busca y toca 'Child Protect' en la lista.",
            fr: "Trouvez et appuyez sur 'Child Protect' dans la liste.",
          },
          {
            en: "Turn ON 'Permit usage access' switch.",
            hi: "'उपयोग पहुंच की अनुमति दें' स्विच चालू करें।",
            gu: "'વપરાશ ઍક્સેસ આપો' સ્વિચ ચાલુ કરો.",
            es: "Activa 'Permitir acceso de uso'.",
            fr: "Activez l'autorisation d'accès aux données d'usage.",
          },
        ],
        deepLinkIntent: 'USAGE_ACCESS_SETTINGS',
      },
    },
  },
  DISPLAY_OVER_APPS: {
    generic: {
      '*': {
        title: {
          en: 'Display Over Other Apps',
          hi: 'अन्य ऐप्स पर प्रदर्शित करें',
          gu: 'અન્ય ઍપ્સ પર પ્રદર્શિત કરો',
          es: 'Mostrar sobre otras aplicaciones',
          fr: 'Afficher par-dessus d’autres applications',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Locate 'Child Protect' in the list.",
            hi: "सूची में 'Child Protect' खोजें।",
            gu: "સૂચિમાં 'Child Protect' શોધો.",
            es: "Busca 'Child Protect' en la lista.",
            fr: "Trouvez 'Child Protect' dans la liste.",
          },
          {
            en: "Turn ON 'Allow display over other apps' / 'Appear on top'.",
            hi: "'अन्य ऐप्स पर प्रदर्शित करने की अनुमति दें' चालू करें।",
            gu: "'અન્ય ઍપ્સ પર દેખાવા દો' સ્વિચ ચાલુ કરો.",
            es: "Activa 'Permitir mostrar sobre otras apps'.",
            fr: "Activez 'Afficher par-dessus d'autres applications'.",
          },
        ],
        deepLinkIntent: 'MANAGE_OVERLAY_PERMISSION',
      },
    },
  },
  DEVICE_ADMIN: {
    generic: {
      '*': {
        title: {
          en: 'Activate Device Admin',
          hi: 'डिवाइस व्यवस्थापक सक्रिय करें',
          gu: 'ડિવાઇસ એડમિન સક્રિય કરો',
          es: 'Activar administración del dispositivo',
          fr: 'Activer l’administrateur de l’appareil',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Review child protection anti-tamper permissions.",
            hi: "बाल सुरक्षा एंटी-छेड़छाड़ अनुमतियों की समीक्षा करें।",
            gu: "બાળ સુરક્ષા એન્ટી-ટેમ્પર પરવાનગીઓની સમીક્ષા કરો.",
            es: "Revisa los permisos de protección infantil contra manipulaciones.",
            fr: "Vérifiez les règles de protection antivol et antimodification.",
          },
          {
            en: "Tap 'ACTIVATE' button at the bottom.",
            hi: "नीचे 'सक्रिय करें' बटन पर टैप करें।",
            gu: "નીચે 'સક્રિય કરો' બટન પર ટૅપ કરો.",
            es: "Toca el botón 'ACTIVAR' en la parte inferior.",
            fr: "Appuyez sur 'ACTIVER' en bas.",
          },
        ],
        deepLinkIntent: 'DEVICE_ADMIN_SETTINGS',
      },
    },
  },
  SCREEN_CAPTURE: {
    generic: {
      '*': {
        title: {
          en: 'Activate Screen Capture',
          hi: 'स्क्रीन कैप्चर सक्रिय करें',
          gu: 'સ્ક્રીન કૅપ્ચર સક્રિય કરો',
          es: 'Activar captura de pantalla',
          fr: 'Activer la capture d’écran',
        },
        steps: [
          {
            en: "Tap 'Start Capture' below.",
            hi: "नीचे 'कैप्चर शुरू करें' पर टैप करें।",
            gu: "નીચે 'કૅપ્ચર શરૂ કરો' પર ટૅપ કરો.",
            es: "Toca 'Iniciar captura' abajo.",
            fr: "Appuyez sur 'Démarrer la capture'.",
          },
          {
            en: "Check the 'Don't show again' checkbox if present.",
            hi: "यदि उपलब्ध हो, तो 'फिर से न दिखाएं' चेकबॉक्स टिक करें।",
            gu: "જો ઉપલબ્ધ હોય, તો 'ફરીથી બતાવશો નહીં' ચેકબૉક્સ ટિક કરો.",
            es: "Marca 'No volver a mostrar' si aparece.",
            fr: "Cochez 'Ne plus afficher' si l'option est présente.",
          },
          {
            en: "Tap 'START NOW' on the system dialog prompt.",
            hi: "सिस्टम डायलॉग पर 'अभी शुरू करें' पर टैप करें।",
            gu: "સિસ્ટમ સંવાદ પર 'હમણાં શરૂ કરો' પર ટૅપ કરો.",
            es: "Toca 'INICIAR AHORA' en el diálogo del sistema.",
            fr: "Appuyez sur 'COMMENCER' sur la boîte de dialogue.",
          },
        ],
      },
    },
  },
  AUTOSTART: {
    xiaomi: {
      '*': {
        title: {
          en: 'Enable Xiaomi / MIUI Autostart',
          hi: 'शाओमी / MIUI ऑटोस्टार्ट सक्षम करें',
          gu: 'શાઓમી / MIUI ઑટોસ્ટાર્ટ ચાલુ કરો',
          es: 'Activar inicio automático Xiaomi / MIUI',
          fr: 'Activer le démarrage automatique Xiaomi / MIUI',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' to open MIUI Autostart manager.",
            hi: "MIUI ऑटोस्टार्ट प्रबंधक खोलने के लिए 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "MIUI ઑટોસ્ટાર્ટ મેનેજર ખોલવા 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' para abrir el gestor de inicio automático MIUI.",
            fr: "Appuyez sur 'Paramètres' pour ouvrir le gestionnaire de démarrage MIUI.",
          },
          {
            en: "Find 'Child Protect' in the app list.",
            hi: "ऐप सूची में 'Child Protect' ढूंढें।",
            gu: "ઍપ સૂચિમાં 'Child Protect' શોધો.",
            es: "Encuentra 'Child Protect' en la lista.",
            fr: "Trouvez 'Child Protect' dans la liste.",
          },
          {
            en: "Turn ON the Autostart toggle switch.",
            hi: "ऑटोस्टार्ट टॉगल स्विच चालू करें।",
            gu: "ઑટોસ્ટાર્ટ સ્વિચ ચાલુ કરો.",
            es: "Activa el interruptor de inicio automático.",
            fr: "Activez le bouton de démarrage automatique.",
          },
        ],
        deepLinkIntent: 'OEM_AUTOSTART',
      },
    },
    oppo: {
      '*': {
        title: {
          en: 'Enable Oppo / Realme / OnePlus Auto-launch',
          hi: 'ओप्पो / रियलमी / वनप्लस ऑटो-लॉन्च सक्षम करें',
          gu: 'ઓપ્પો / રિયલમી / વનપ્લસ ઑટો-લૉન્ચ ચાલુ કરો',
          es: 'Activar inicio automático Oppo / Realme / OnePlus',
          fr: 'Activer le lancement automatique Oppo / Realme / OnePlus',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Enable 'Auto-launch' and 'Allow background running' for Child Protect.",
            hi: "Child Protect के लिए 'ऑटो-लॉन्च' और 'पृष्ठभूमि में चलने दें' सक्षम करें।",
            gu: "Child Protect માટે 'ઑટો-લૉન્ચ' અને 'બેકગ્રાઉન્ડ ચાલવા દો' ચાલુ કરો.",
            es: "Activa 'Inicio automático' y 'Ejecución en segundo plano'.",
            fr: "Activez 'Lancement automatique' et 'Exécution en arrière-plan'.",
          },
        ],
        deepLinkIntent: 'OEM_AUTOSTART',
      },
    },
    vivo: {
      '*': {
        title: {
          en: 'Enable Vivo / iQOO Autostart',
          hi: 'विवो / iQOO ऑटोस्टार्ट सक्षम करें',
          gu: 'વિવો / iQOO ઑટોસ્ટાર્ટ ચાલુ કરો',
          es: 'Activar inicio automático Vivo / iQOO',
          fr: 'Activer le démarrage automatique Vivo / iQOO',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings'.",
            hi: "'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes'.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Turn ON Autostart & enable 'High background power consumption'.",
            hi: "ऑटोस्टार्ट चालू करें और 'उच्च पृष्ठभूमि बिजली खपत' की अनुमति दें।",
            gu: "ઑટોસ્ટાર્ટ ચાલુ કરો અને 'હાઈ બેકગ્રાઉન્ડ પાવર વપરાશ' મંજૂર કરો.",
            es: "Activa Inicio automático y 'Consumo de energía alto en segundo plano'.",
            fr: "Activez le démarrage automatique et la consommation haute en arrière-plan.",
          },
        ],
        deepLinkIntent: 'OEM_AUTOSTART',
      },
    },
    generic: {
      '*': {
        title: {
          en: 'Enable Autostart & Background Protection',
          hi: 'ऑटोस्टार्ट और पृष्ठभूमि सुरक्षा सक्षम करें',
          gu: 'ઑટોસ્ટાર્ટ અને બેકગ્રાઉન્ડ સુરક્ષા ચાલુ કરો',
          es: 'Activar inicio automático y protección de fondo',
          fr: 'Activer le démarrage automatique et la protection d’arrière-plan',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' below.",
            hi: "नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Allow Child Protect to start automatically on system boot.",
            hi: "फोन चालू होने पर Child Protect को स्वचालित रूप से शुरू होने दें।",
            gu: "ફોન ચાલુ થતાં Child Protect ને આપોઆપ શરૂ થવા દો.",
            es: "Permite que Child Protect se inicie al arrancar el teléfono.",
            fr: "Autorisez Child Protect à démarrer au lancement du système.",
          },
        ],
        deepLinkIntent: 'OEM_AUTOSTART',
      },
    },
  },
  BACKGROUND_RUNNING: {
    samsung: {
      '*': {
        title: {
          en: 'Allow Background Running (Samsung)',
          hi: 'सैमसंग में पृष्ठभूमि में चलने की अनुमति दें',
          gu: 'સેમસંગમાં બેકગ્રાઉન્ડમાં ચાલવાની મંજૂરી આપો',
          es: 'Permitir ejecución en segundo plano (Samsung)',
          fr: 'Autoriser l’arrière-plan (Samsung)',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' below.",
            hi: "नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Tap 'Battery' -> select 'Unrestricted'.",
            hi: "'बैटरी' पर टैप करें -> 'अप्रतिबंधित' (Unrestricted) चुनें।",
            gu: "'બેટરી' પર ટૅપ કરો -> 'અપ્રતિબંધિત' (Unrestricted) પસંદ કરો.",
            es: "Toca 'Batería' -> selecciona 'Sin restricciones'.",
            fr: "Appuyez sur 'Batterie' -> sélectionnez 'Non restreinte'.",
          },
          {
            en: "Turn OFF 'Remove permissions if app is unused'.",
            hi: "'यदि ऐप का उपयोग न हो तो अनुमतियां हटाएं' बंद करें।",
            gu: "'જો ઍપ ઉપયોગ ન થાય તો પરવાનગીઓ હટાવો' બંધ કરો.",
            es: "Desactiva 'Quitar permisos si la aplicación no se usa'.",
            fr: "Désactivez 'Supprimer les autorisations si l'application est inutilisée'.",
          },
        ],
        deepLinkIntent: 'APP_DETAILS',
      },
    },
    generic: {
      '*': {
        title: {
          en: 'Disable Battery Optimization',
          hi: 'बैटरी अनुकूलन अक्षम करें',
          gu: 'બેટરી ઓપ્ટિમાઇઝેશન બંધ કરો',
          es: 'Desactivar optimización de batería',
          fr: 'Désactiver l’optimisation de batterie',
        },
        steps: [
          {
            en: "Tap 'Proceed to Settings' below.",
            hi: "नीचे 'सेटिंग्स पर जाएं' पर टैप करें।",
            gu: "નીચે 'સેટિંગ્સ પર જાઓ' પર ટૅપ કરો.",
            es: "Toca 'Ir a Ajustes' abajo.",
            fr: "Appuyez sur 'Aller aux paramètres'.",
          },
          {
            en: "Tap 'ALLOW' on 'Stop optimizing battery usage' prompt.",
            hi: "'बैटरी उपयोग अनुकूलन बंद करें' संकेत पर 'अनुमति दें' पर टैप करें।",
            gu: "'બેટરી વપરાશ ઑપ્ટિમાઇઝેશન બંધ કરો' પર 'મંજૂરી આપો' પર ટૅપ કરો.",
            es: "Toca 'PERMITIR' para ignorar la optimización de batería.",
            fr: "Appuyez sur 'AUTORISER' pour désactiver l'optimisation de la batterie.",
          },
        ],
        deepLinkIntent: 'BATTERY_OPTIMIZATION',
      },
    },
  },
  LOCK_APP: {
    generic: {
      '*': {
        title: {
          en: 'Lock App from Task Manager',
          hi: 'टास्क मैनेजर में ऐप को लॉक करें',
          gu: 'ટાસ્ક મેનેજરમાં ઍપ લૉક કરો',
          es: 'Bloquear app en aplicaciones recientes',
          fr: 'Verrouiller l’application dans les tâches récentes',
        },
        steps: [
          {
            en: "Open Recent Apps / Task Manager (Square button or Swipe up & hold).",
            hi: "हाल की ऐप्स / टास्क मैनेजर खोलें (चौकोर बटन या ऊपर स्वाइप करके होल्ड करें)।",
            gu: "તાજેતરની ઍપ્સ / ટાસ્ક મેનેજર ખોલો (ચોરસ બટન અથવા ઉપર સ્વાઇપ કરી પકડી રાખો).",
            es: "Abre Aplicaciones recientes (botón cuadrado o deslizar arriba y mantener).",
            fr: "Ouvrez les applications récentes (bouton carré ou glisser vers le haut et maintenir).",
          },
          {
            en: "Long press or tap app icon / menu on 'Child Protect'.",
            hi: "'Child Protect' के ऐप आइकन या मेनू पर देर तक दबाएं।",
            gu: "'Child Protect' ના ઍપ આઇકોન અથવા મેનુ પર દબાવી રાખો.",
            es: "Mantén presionado o toca el icono/menú de 'Child Protect'.",
            fr: "Appuyez longuement ou touchez l'icône/menu de 'Child Protect'.",
          },
          {
            en: "Tap 'Lock' (Padlock icon) to prevent 'Clear All' from killing protection.",
            hi: "'लॉक' (ताला आइकन) दबाएं ताकि 'सब साफ़ करें' से सुरक्षा बंद न हो।",
            gu: "'લૉક' (તાળું આઇકોન) ટૅપ કરો જેથી 'બધું સાફ કરો' થી સુરક્ષા બંધ ન થાય.",
            es: "Toca 'Bloquear' (candado) para que 'Borrar todo' no cierre la protección.",
            fr: "Touchez 'Verrouiller' (cadenas) pour que 'Tout effacer' ne ferme pas l'appli.",
          },
        ],
      },
    },
  },
};
