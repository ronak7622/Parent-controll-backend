export interface NotificationTemplate {
  title: Record<string, string>;
  body: Record<string, string>;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  LIMIT_REACHED: {
    title: {
      en: 'App Limit Reached: {appName}',
      hi: 'ऐप समय सीमा समाप्त: {appName}',
      gu: 'ઍપ સમય મર્યાદા પૂર્ણ: {appName}',
      es: 'Límite de aplicación alcanzado: {appName}',
      fr: 'Limite d’application atteinte: {appName}',
    },
    body: {
      en: '{childName} has reached the allowed time limit for {appName}. The app has been temporarily paused.',
      hi: '{childName} ने {appName} के लिए अनुमत समय सीमा पूरी कर ली है। ऐप को अस्थायी रूप से रोक दिया गया है।',
      gu: '{childName} એ {appName} માટે મંજૂર સમય મર્યાદા પૂરી કરી લીધી છે. ઍપને કામચલાઉ થોભાવી દેવામાં આવી છે.',
      es: '{childName} ha alcanzado el límite de tiempo de {appName}. La app ha sido pausada temporalmente.',
      fr: '{childName} a atteint la limite de temps pour {appName}. L’application a été temporairement suspendue.',
    },
  },
  BLOCKED_APP_ATTEMPT: {
    title: {
      en: 'Blocked App Attempt: {appName}',
      hi: 'अवरुद्ध ऐप खोलने का प्रयास: {appName}',
      gu: 'પ્રતિબંધિત ઍપ ખોલવાનો પ્રયાસ: {appName}',
      es: 'Intento de abrir app bloqueada: {appName}',
      fr: 'Tentative d’ouverture d’app bloquée: {appName}',
    },
    body: {
      en: '{childName} attempted to open blocked app {appName}.',
      hi: '{childName} ने ब्लॉक की गई ऐप {appName} खोलने का प्रयास किया।',
      gu: '{childName} એ બ્લૉક કરેલી ઍપ {appName} ખોલવાનો પ્રયાસ કર્યો.',
      es: '{childName} intentó abrir la aplicación bloqueada {appName}.',
      fr: '{childName} a essayé d’ouvrir l’application bloquée {appName}.',
    },
  },
  BLOCKED_URL_ATTEMPT: {
    title: {
      en: 'Restricted Website Blocked',
      hi: 'प्रतिबंधित वेबसाइट ब्लॉक की गई',
      gu: 'પ્રતિબંધિત વેબસાઇટ બ્લૉક કરવામાં આવી',
      es: 'Sitio web restringido bloqueado',
      fr: 'Site web restreint bloqué',
    },
    body: {
      en: '{childName} attempted to access {url}. The site was blocked by web safety filter.',
      hi: '{childName} ने {url} पर जाने का प्रयास किया। वेब सुरक्षा फ़िल्टर द्वारा साइट को ब्लॉक कर दिया गया।',
      gu: '{childName} એ {url} ઍક્સેસ કરવાનો પ્રયાસ કર્યો. સાઇટને વેબ સેફ્ટી ફિલ્ટર દ્વારા બ્લૉક કરવામાં આવી.',
      es: '{childName} intentó acceder a {url}. El sitio fue bloqueado por el filtro de seguridad web.',
      fr: '{childName} a tenté d’accéder à {url}. Le site a été bloqué par le filtre de sécurité.',
    },
  },
  PLAN_EXPIRING_SOON: {
    title: {
      en: 'Subscription Expiring Soon',
      hi: 'सदस्यता जल्द समाप्त होने वाली है',
      gu: 'સબ્સ્ક્રિપ્શન ટૂંક સમયમાં સમાપ્ત થાય છે',
      es: 'La suscripción expira pronto',
      fr: 'Abonnement expire bientôt',
    },
    body: {
      en: 'Your Parent Protect subscription for {deviceName} expires in {days} day(s). Renew now to maintain uninterrupted protection.',
      hi: '{deviceName} के लिए आपकी सुरक्षा सदस्यता {days} दिन(नों) में समाप्त हो जाएगी। निरंतर सुरक्षा के लिए अभी नवीनीकरण करें।',
      gu: '{deviceName} માટેનું તમારું સુરક્ષા સબ્સ્ક્રિપ્શન {days} દિવસમાં સમાપ્ત થશે. સુરક્ષા ચાલુ રાખવા માટે હમણાં જ રિન્યુ કરો.',
      es: 'Tu suscripción para {deviceName} vence en {days} día(s). Renuévala ahora para mantener la protección.',
      fr: 'Votre abonnement pour {deviceName} expire dans {days} jour(s). Renouvelez-le pour garder la protection active.',
    },
  },
  PLAN_EXPIRED: {
    title: {
      en: 'Subscription Expired',
      hi: 'सदस्यता समाप्त हो गई है',
      gu: 'સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે',
      es: 'Suscripción expirada',
      fr: 'Abonnement expiré',
    },
    body: {
      en: 'Your subscription for {deviceName} has expired. Real-time monitoring and live streaming are paused. Renew to resume.',
      hi: '{deviceName} के लिए आपकी सदस्यता समाप्त हो गई है। रीयल-टाइम मॉनिटरिंग रोक दी गई है। पुनः शुरू करने के लिए नवीनीकरण करें।',
      gu: '{deviceName} માટેનું તમારું સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે. રીઅલ-ટાઇમ મોનિટરિંગ થોભાવી દેવામાં આવ્યું છે. ફરી શરૂ કરવા રિન્યુ કરો.',
      es: 'Tu suscripción para {deviceName} ha expirado. El monitoreo en tiempo real se ha detenido.',
      fr: 'Votre abonnement pour {deviceName} a expiré. La surveillance en temps réel est interrompue.',
    },
  },
  TRIAL_EXPIRING_SOON: {
    title: {
      en: 'Free Trial Ending Soon',
      hi: 'मुफ़्त ट्रायल जल्द समाप्त हो रहा है',
      gu: 'મફત ટ્રાયલ ટૂંક સમયમાં સમાપ્ત થાય છે',
      es: 'La prueba gratuita termina pronto',
      fr: 'Essai gratuit se termine bientôt',
    },
    body: {
      en: 'Your 24-hour free trial expires in {hours} hour(s). Choose a plan to keep child protection active.',
      hi: 'आपका 24 घंटे का मुफ़्त ट्रायल {hours} घंटे में समाप्त हो रहा है। बाल सुरक्षा सक्रिय रखने के लिए प्लान चुनें।',
      gu: 'તમારું 24-કલાકનું મફત ટ્રાયલ {hours} કલાકમાં સમાપ્ત થઈ રહ્યું છે. સુરક્ષા ચાલુ રાખવા માટે પ્લાન પસંદ કરો.',
      es: 'Tu prueba gratuita de 24 horas expira en {hours} hora(s). Elige un plan para mantener la protección.',
      fr: 'Votre essai gratuit de 24h expire dans {hours} heure(s). Choisissez un forfait pour continuer.',
    },
  },
  TRIAL_EXPIRED: {
    title: {
      en: 'Free Trial Expired',
      hi: 'मुफ़्त ट्रायल समाप्त हो गया',
      gu: 'મફત ટ્રાયલ સમાપ્ત થઈ ગયું',
      es: 'Prueba gratuita finalizada',
      fr: 'Essai gratuit expiré',
    },
    body: {
      en: 'Your free trial has ended. Subscribe now to unlock unlimited live streams and 24/7 background protection.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है। असीमित लाइव स्ट्रीम और 24/7 पृष्ठभूमि सुरक्षा के लिए अभी सदस्यता लें।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે. અનલિમિટેડ લાઇવ સ્ટ્રીમ અને 24/7 બેકગ્રાઉન્ડ સુરક્ષા માટે હમણાં જ સબ્સ્ક્રાઇબ કરો.',
      es: 'Tu prueba gratuita ha finalizado. Suscríbete ahora para desbloquear transmisiones en vivo ilimitadas.',
      fr: 'Votre essai gratuit est terminé. Abonnez-vous pour débloquer le streaming en direct et la protection.',
    },
  },
  STORAGE_WARNING: {
    title: {
      en: 'Cloud Storage Almost Full ({percent}%)',
      hi: 'क्लाउड स्टोरेज लगभग भर चुका है ({percent}%)',
      gu: 'ક્લાઉડ સ્ટોરેજ લગભગ ભરાઈ ગયું છે ({percent}%)',
      es: 'Almacenamiento en la nube casi lleno ({percent}%)',
      fr: 'Stockage cloud presque plein ({percent}%)',
    },
    body: {
      en: 'You have used {percent}% of your allocated cloud storage. Get a storage booster add-on or enable auto-delete.',
      hi: 'आपने अपने आवंटित क्लाउड स्टोरेज का {percent}% उपयोग कर लिया है। स्टोरेज बूस्टर एड-ऑन प्राप्त करें या ऑटो-डिलीट सक्षम करें।',
      gu: 'તમે તમારા ક્લાઉડ સ્ટોરેજનો {percent}% ઉપયોગ કર્યો છે. સ્ટોરેજ બૂસ્ટર એડ-ઓન મેળવો અથવા ઓટો-ડિલીટ ચાલુ કરો.',
      es: 'Has utilizado el {percent}% de tu almacenamiento en la nube. Añade más almacenamiento o activa el borrado automático.',
      fr: 'Vous avez utilisé {percent}% de votre stockage cloud. Ajoutez de l’espace ou activez la suppression automatique.',
    },
  },
  CHILD_APP_UPDATE: {
    title: {
      en: 'Child App Update Required',
      hi: 'चाइल्ड ऐप अपडेट आवश्यक है',
      gu: 'ચાઇલ્ડ ઍપ અપડેટ જરૂરી છે',
      es: 'Actualización requerida en app del niño',
      fr: 'Mise à jour requise sur l’app enfant',
    },
    body: {
      en: 'A security update is available for {childName}\'s device ({deviceName}). Please update to keep all features functioning.',
      hi: '{childName} के डिवाइस ({deviceName}) के लिए सुरक्षा अपडेट उपलब्ध है। सभी सुविधाएं चालू रखने के लिए कृपया अपडेट करें।',
      gu: '{childName} ના ડિવાઇસ ({deviceName}) માટે સુરક્ષા અપડેટ ઉપલબ્ધ છે. યોગ્ય સુરક્ષા માટે કૃપા કરીને અપડેટ કરો.',
      es: 'Hay una actualización de seguridad disponible para el dispositivo de {childName} ({deviceName}).',
      fr: 'Une mise à jour de sécurité est disponible pour l’appareil de {childName} ({deviceName}).',
    },
  },
  DEVICE_UNPAIRED: {
    title: {
      en: 'Child Device Unpaired',
      hi: 'चाइल्ड डिवाइस अनपेयर कर दिया गया',
      gu: 'ચાઇલ્ડ ડિવાઇસ અનપેર કરવામાં આવ્યું',
      es: 'Dispositivo infantil desvinculado',
      fr: 'Appareil enfant dissocié',
    },
    body: {
      en: '{deviceName} has been disconnected and unpaired from your parent account.',
      hi: '{deviceName} को आपके पैरेंट खाते से डिस्कनेक्ट और अनपेयर कर दिया गया है।',
      gu: '{deviceName} તમારા પેરન્ટ એકાઉન્ટમાંથી ડિસ્કનેક્ટ અને અનપેર કરવામાં આવ્યું છે.',
      es: '{deviceName} ha sido desconectado y desvinculado de tu cuenta de padre.',
      fr: '{deviceName} a été déconnecté et dissocié de votre compte parent.',
    },
  },
  RECORDING_COMPLETED: {
    title: {
      en: '{typeLabel} Saved',
      hi: '{typeLabel} सहेजा गया',
      gu: '{typeLabel} સાચવવામાં આવ્યું',
      es: '{typeLabel} guardada',
      fr: '{typeLabel} enregistrée',
    },
    body: {
      en: '{childName} completed {typeLabel} ({durationStr})',
      hi: '{childName} ने {typeLabel} पूरी की ({durationStr})',
      gu: '{childName} એ {typeLabel} પૂર્ણ કરી ({durationStr})',
      es: '{childName} completó {typeLabel} ({durationStr})',
      fr: '{childName} a terminé {typeLabel} ({durationStr})',
    },
  },
  YOUTUBE_SHORTS_BLOCKED: {
    title: {
      en: 'Blocked Shorts Access',
      hi: 'अवरुद्ध शॉर्ट्स एक्सेस',
      gu: 'પ્રતિબંધિત શોર્ટ્સ ઍક્સેસ',
      es: 'Acceso a Shorts bloqueado',
      fr: 'Accès Shorts bloqué',
    },
    body: {
      en: '{childName} attempted to access YouTube Shorts at {timeStr} while blocked',
      hi: '{childName} ने ब्लॉक होने के दौरान {timeStr} पर YouTube Shorts देखने का प्रयास किया',
      gu: '{childName} એ બ્લૉક હોવા છતાં {timeStr} વાગ્યે YouTube Shorts જોવાનો પ્રયાસ કર્યો',
      es: '{childName} intentó acceder a YouTube Shorts a las {timeStr} estando bloqueado',
      fr: '{childName} a tenté d’accéder à YouTube Shorts à {timeStr} alors qu’ils étaient bloqués',
    },
  },
  YOUTUBE_APP_BLOCKED: {
    title: {
      en: 'Blocked YouTube Access',
      hi: 'अवरुद्ध YouTube एक्सेस',
      gu: 'પ્રતિબંધિત YouTube ઍક્સેસ',
      es: 'Acceso a YouTube bloqueado',
      fr: 'Accès YouTube bloqué',
    },
    body: {
      en: '{childName} attempted to open YouTube App at {timeStr} while blocked',
      hi: '{childName} ने ब्लॉक होने के दौरान {timeStr} पर YouTube ऐप खोलने का प्रयास किया',
      gu: '{childName} એ બ્લૉક હોવા છતાં {timeStr} વાગ્યે YouTube ઍપ ખોલવાનો પ્રયાસ કર્યો',
      es: '{childName} intentó abrir la aplicación YouTube a las {timeStr} estando bloqueada',
      fr: '{childName} a essayé d’ouvrir l’application YouTube à {timeStr} alors qu’elle était bloquée',
    },
  },
  STORAGE_FULL: {
    title: {
      en: 'Cloud Storage 100% Full',
      hi: 'क्लाउड स्टोरेज 100% भर गया है',
      gu: 'ક્લાઉડ સ્ટોરેજ 100% ભરાઈ ગયું છે',
      es: 'Almacenamiento en la nube 100% lleno',
      fr: 'Stockage cloud 100% plein',
    },
    body: {
      en: 'Cloud storage is 100% full and child monitoring has STOPPED! Clean storage or purchase a storage booster plan.',
      hi: 'क्लाउड स्टोरेज 100% भर चुका है और बाल सुरक्षा रुक गई है! स्टोरेज खाली करें या बूस्टर प्लान लें।',
      gu: 'ક્લાઉડ સ્ટોરેજ 100% ભરાઈ ગયું છે અને દેખરેખ બંધ થઈ ગઈ છે! સ્ટોરેજ ખાલી કરો અથવા બૂસ્ટર મેળવો.',
      es: '¡El almacenamiento en la nube está al 100% y la monitorización se ha detenido! Libera espacio o compra un booster.',
      fr: 'Le stockage cloud est plein à 100% et la surveillance est arrêtée ! Libérez de l’espace ou achetez un booster.',
    },
  },
  LIVE_DAILY_LIMIT_REACHED: {
    title: {
      en: 'Daily Live Limit Reached',
      hi: 'दैनिक लाइव सीमा समाप्त',
      gu: 'દૈનિક લાઇવ મર્યાદા પૂર્ણ',
      es: 'Límite diario de en vivo alcanzado',
      fr: 'Limite quotidienne de direct atteinte',
    },
    body: {
      en: 'Daily live streaming limit reached. Purchase a live minutes booster or try again tomorrow.',
      hi: 'दैनिक लाइव स्ट्रीमिंग सीमा समाप्त हो गई है। लाइव मिनट बूस्टर खरीदें या कल पुनः प्रयास करें।',
      gu: 'દૈનિક લાઇવ સ્ટ્રીમિંગ મર્યાદા પૂરી થઈ ગઈ છે. લાઇવ મિનિટ બૂસ્ટર ખરીદો અથવા કાલે ફરી પ્રયાસ કરો.',
      es: 'Se alcanzó el límite diario de transmisión en vivo. Compra minutos adicionales o inténtalo mañana.',
      fr: 'Limite quotidienne de streaming en direct atteinte. Achetez un booster ou réessayez demain.',
    },
  },
  LIVE_TOTAL_LIMIT_REACHED: {
    title: {
      en: 'Total Live Limit Reached',
      hi: 'कुल लाइव सीमा समाप्त',
      gu: 'કુલ લાઇવ મર્યાદા પૂર્ણ',
      es: 'Límite total de en vivo alcanzado',
      fr: 'Limite totale de direct atteinte',
    },
    body: {
      en: 'Total live streaming limit reached for your plan. Purchase a live minutes booster to continue.',
      hi: 'आपके प्लान की कुल लाइव स्ट्रीमिंग सीमा समाप्त हो गई है। जारी रखने के लिए लाइव मिनट बूस्टर खरीदें।',
      gu: 'તમારા પ્લાનની કુલ લાઇવ સ્ટ્રીમિંગ મર્યાદા પૂર્ણ થઈ ગઈ છે. ચાલુ રાખવા માટે લાઇવ મિનિટ બૂસ્ટર મેળવો.',
      es: 'Se alcanzó el límite total de transmisión en vivo de tu plan. Compra un booster para continuar.',
      fr: 'Limite totale de streaming atteinte pour votre forfait. Achetez un booster pour continuer.',
    },
  },
  LIVE_ADDON_EXHAUSTED: {
    title: {
      en: 'Live Minutes Booster Exhausted',
      hi: 'लाइव मिनट्स बूस्टर समाप्त',
      gu: 'લાઇવ મિનિટ્સ બૂસ્ટર સમાપ્ત',
      es: 'Booster de minutos en vivo agotado',
      fr: 'Booster de minutes en direct épuisé',
    },
    body: {
      en: 'Your live minutes add-on booster has been exhausted. Purchase another booster to continue streaming.',
      hi: 'आपका लाइव मिनट्स एड-ऑन बूस्टर समाप्त हो गया है। स्ट्रीमिंग जारी रखने के लिए अन्य बूस्टर खरीदें।',
      gu: 'તમારું લાઇવ મિનિટ્સ એડ-ઓન બૂસ્ટર સમાપ્ત થઈ ગયું છે. સ્ટ્રીમિંગ ચાલુ રાખવા બીજું બૂસ્ટર મેળવો.',
      es: 'Tu booster de minutos en vivo se ha agotado. Compra otro booster para continuar transmitiendo.',
      fr: 'Votre booster de minutes en direct est épuisé. Achetez un autre booster pour continuer.',
    },
  },
  PLAN_EXPIRED_GRACE: {
    title: {
      en: 'Plan Expired — Grace Active',
      hi: 'प्लान समाप्त — ग्रेस पीरियड सक्रिय',
      gu: 'પ્લાન સમાપ્ત — ગ્રેસ સમય સક્રિય',
      es: 'Plan expirado — Período de gracia activo',
      fr: 'Forfait expiré — Période de grâce active',
    },
    body: {
      en: 'Your subscription plan has expired and child monitoring has stopped. All child data will be permanently deleted in {graceText}. Renew your plan now to prevent permanent deletion and resume monitoring.',
      hi: 'आपकी सदस्यता समाप्त हो गई है और निगरानी रोक दी गई है। सभी डेटा {graceText} में स्थायी रूप से हटा दिया जाएगा। सुरक्षा जारी रखने के लिए अभी नवीनीकरण करें।',
      gu: 'તમારું સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે અને દેખરેખ બંધ થઈ ગઈ છે. તમામ ડેટા {graceText} માં હંમેશ માટે કાઢી નાખવામાં આવશે. સુરક્ષા ચાલુ રાખવા માટે હમણાં જ રિન્યુ કરો.',
      es: 'Tu suscripción ha expirado y la monitorización se ha detenido. Todos los datos se eliminarán permanentemente en {graceText}. Renuévala ahora para continuar.',
      fr: 'Votre abonnement a expiré et la surveillance est arrêtée. Toutes les données seront définitivement supprimées dans {graceText}. Renouvelez maintenant pour continuer.',
    },
  },
  TRIAL_EXPIRED_GRACE: {
    title: {
      en: 'Free Trial Expired (Grace Active)',
      hi: 'मुफ़्त ट्रायल समाप्त (ग्रेस पीरियड सक्रिय)',
      gu: 'મફત ટ્રાયલ સમાપ્ત (ગ્રેસ સમય સક્રિય)',
      es: 'Prueba gratuita expirada (gracia activa)',
      fr: 'Essai gratuit expiré (grâce active)',
    },
    body: {
      en: 'Your free trial plan has expired and child monitoring has stopped. All child data will be permanently deleted in {graceText}. Renew your plan now to prevent permanent deletion and resume monitoring.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है और निगरानी रुक गई है। सभी डेटा {graceText} में स्थायी रूप से हटा दिया जाएगा। सुरक्षा जारी रखने के लिए अभी नवीनीकरण करें।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે અને દેખરેખ બંધ થઈ ગઈ છે. તમામ ડેટા {graceText} માં હંમેશ માટે કાઢી નાખવામાં આવશે. સુરક્ષા ચાલુ રાખવા માટે હમણાં જ રિન્યુ કરો.',
      es: 'Tu prueba gratuita ha expirado y la monitorización se ha detenido. Todos los datos se eliminarán permanentemente en {graceText}. Renuévala ahora.',
      fr: 'Votre essai gratuit a expiré et la surveillance s’est arrêtée. Les données seront définitivement supprimées dans {graceText}. Renouvelez maintenant.',
    },
  },
  PLAN_EXPIRED_STOPPED: {
    title: {
      en: 'Plan Expired — Monitoring Stopped',
      hi: 'प्लान समाप्त — निगरानी रोक दी गई',
      gu: 'પ્લાન સમાપ્ત — દેખરેખ બંધ કરવામાં આવી',
      es: 'Plan expirado — Monitorización detenida',
      fr: 'Forfait expiré — Surveillance arrêtée',
    },
    body: {
      en: 'Your subscription plan has expired and child monitoring has stopped. Renew your plan now to resume child monitoring.',
      hi: 'आपकी सदस्यता समाप्त हो गई है और निगरानी रोक दी गई है। बाल सुरक्षा पुनः शुरू करने के लिए अभी नवीनीकरण करें।',
      gu: 'તમારું સબ્સ્ક્રિપ્શન સમાપ્ત થઈ ગયું છે અને દેખરેખ બંધ થઈ ગઈ છે. દેખરેખ ફરી શરૂ કરવા માટે હમણાં જ રિન્યુ કરો.',
      es: 'Tu plan ha expirado y la monitorización se ha detenido. Renuévalo ahora para reanudar la protección.',
      fr: 'Votre abonnement a expiré et la surveillance s’est arrêtée. Renouvelez votre forfait pour reprendre la surveillance.',
    },
  },
  TRIAL_EXPIRED_STOPPED: {
    title: {
      en: 'Free Trial Expired',
      hi: 'मुफ़्त ट्रायल समाप्त',
      gu: 'મફત ટ્રાયલ સમાપ્ત',
      es: 'Prueba gratuita finalizada',
      fr: 'Essai gratuit terminé',
    },
    body: {
      en: 'Your free trial plan has expired and child monitoring has stopped. Renew your plan now to resume child monitoring.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है और निगरानी रोक दी गई है। बाल सुरक्षा पुनः शुरू करने के लिए अभी नवीनीकरण करें।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે અને દેખરેખ બંધ થઈ ગઈ છે. દેખરેખ ફરી શરૂ કરવા માટે હમણાં જ રિન્યુ કરો.',
      es: 'Tu prueba gratuita ha finalizado y la monitorización se ha detenido. Renuévala ahora para reanudar la protección.',
      fr: 'Votre essai gratuit est terminé et la surveillance s’est arrêtée. Renouvelez votre forfait pour continuer.',
    },
  },
};

const TEMPLATE_KEY_ALIASES: Record<string, string> = {
  APP_LIMIT_REACHED: 'LIMIT_REACHED',
  APP_BLOCK_ATTEMPT: 'BLOCKED_APP_ATTEMPT',
  BLOCKED_URL_ACCESS: 'BLOCKED_URL_ATTEMPT',
  PLAN_EXPIRED_GRACE: 'PLAN_EXPIRED_GRACE',
  PLAN_EXPIRED_STOPPED: 'PLAN_EXPIRED_STOPPED',
  EXPIRING_SOON: 'PLAN_EXPIRING_SOON',
  STORAGE_WARNING: 'STORAGE_WARNING',
  STORAGE_FULL: 'STORAGE_FULL',
  LIVE_DAILY_LIMIT_REACHED: 'LIVE_DAILY_LIMIT_REACHED',
  LIVE_TOTAL_LIMIT_REACHED: 'LIVE_TOTAL_LIMIT_REACHED',
  LIVE_ADDON_EXHAUSTED: 'LIVE_ADDON_EXHAUSTED',
  RECORDING_COMPLETED: 'RECORDING_COMPLETED',
};

export const getLocalizedNotification = (
  templateKey: string,
  lang: string = 'en',
  params: Record<string, string | number> = {}
): { title: string; body: string } => {
  const normalizedKey = templateKey.toUpperCase().trim();
  const resolvedKey = TEMPLATE_KEY_ALIASES[normalizedKey] || normalizedKey;
  const tpl = NOTIFICATION_TEMPLATES[resolvedKey] || NOTIFICATION_TEMPLATES[templateKey];
  if (!tpl) {
    const rawTitle = String(params.title || templateKey);
    const rawBody = String(params.body || '');
    return { title: rawTitle, body: rawBody };
  }

  const safeLang = ['en', 'hi', 'gu', 'es', 'fr'].includes(lang) ? lang : 'en';

  let title = tpl.title[safeLang] || tpl.title['en'] || '';
  let body = tpl.body[safeLang] || tpl.body['en'] || '';

  for (const [k, v] of Object.entries(params)) {
    const placeholder = `{${k}}`;
    title = title.split(placeholder).join(String(v));
    body = body.split(placeholder).join(String(v));
  }

  return { title, body };
};
