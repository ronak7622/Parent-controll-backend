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
      en: 'Your child protection subscription will expire in {time}. Child device monitoring will stop once expired. Renew your plan now to prevent monitoring from stopping and ensure continuous 24/7 child safety.',
      hi: 'आपकी सुरक्षा सदस्यता {time} में समाप्त हो जाएगी। समाप्त होने के बाद बाल डिवाइस की मॉनिटरिंग बंद हो जाएगी। मॉनिटरिंग बंद होने से रोकने और निरंतर सुरक्षा के लिए अभी अपना प्लान रिन्यू करें।',
      gu: 'તમારું સુરક્ષા સબ્સ્ક્રિપ્શન {time} માં સમાપ્ત થઈ જશે. પ્લાન સમાપ્ત થયા પછી બાળ ડિવાઇસનું મોનિટરિંગ બંધ થઈ જશે. મોનિટરિંગ બંધ થતું અટકાવવા અને સુરક્ષા ચાલુ રાખવા માટે હમણાં જ તમારો પ્લાન રિન્યૂ કરો.',
      es: 'Tu suscripción de protección vencerá en {time}. El monitoreo del dispositivo infantil se detendrá al vencer. Renueva tu plan ahora para evitar interrupciones en la seguridad.',
      fr: 'Votre abonnement de protection expirera dans {time}. La surveillance de l’appareil enfant s’arrêtera à expiration. Renouvelez dès maintenant pour éviter toute interruption.',
    },
  },
  PLAN_EXPIRED: {
    title: {
      en: 'Subscription Expired — Monitoring Stopped',
      hi: 'सदस्यता समाप्त — मॉनिटरिंग बंद',
      gu: 'પ્લાન સમાપ્ત — મોનિટરિંગ બંધ',
      es: 'Suscripción expirada — Monitoreo detenido',
      fr: 'Abonnement expiré — Surveillance arrêtée',
    },
    body: {
      en: 'Your subscription plan has expired and child monitoring has stopped. Previously recorded data is held in grace period but will be permanently deleted after grace period ends. Renew your plan now to prevent data deletion and resume monitoring.',
      hi: 'आपका सदस्यता प्लान समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। पहले का डेटा ग्रेस अवधि में सुरक्षित है लेकिन ग्रेस अवधि समाप्त होने पर स्थायी रूप से हटा दिया जाएगा। डेटा हटाने से रोकने और मॉनिटरिंग पुनः शुरू करने के लिए अभी रिन्यू करें।',
      gu: 'તમારો સબ્સ્ક્રિપ્શન પ્લાન સમાપ્ત થઈ ગયો છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. અગાઉ સેવ કરેલો ડેટા ગ્રેસ સમયગાળામાં સુરક્ષિત છે, પરંતુ ગ્રેસ સમયગાળો પૂર્ણ થતાં કાયમ માટે ડિલીટ થઈ જશે. ડેટા ડિલીટ થતો અટકાવવા અને મોનિટરિંગ ફરી શરૂ કરવા હમણાં જ રિન્યૂ કરો.',
      es: 'Tu suscripción ha vencido y el monitoreo del menor se ha detenido. Los datos históricos se conservan temporalmente pero se eliminarán permanentemente al finalizar el período de gracia. Renueva tu plan ahora para evitar la eliminación.',
      fr: 'Votre abonnement a expiré et la surveillance enfant s’est arrêtée. Vos données sont temporairement conservées mais seront définitivement supprimées à la fin du délai de grâce. Renouvelez votre forfait dès maintenant.',
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
      en: 'Your free trial expires in {hours} hour(s). Child device monitoring will stop once expired. Purchase a protection plan now to prevent monitoring from stopping and ensure continuous safety.',
      hi: 'आपका मुफ़्त ट्रायल {hours} घंटे में समाप्त हो जाएगा। समाप्त होने के बाद बाल डिवाइस की मॉनिटरिंग बंद हो जाएगी। मॉनिटरिंग चालू रखने के लिए अभी सुरक्षा प्लान खरीदें।',
      gu: 'તમારું મફત ટ્રાયલ {hours} કલાકમાં સમાપ્ત થઈ જશે. ટ્રાયલ સમાપ્ત થયા પછી બાળ ડિવાઇસનું મોનિટરિંગ બંધ થઈ જશે. મોનિટરિંગ બંધ થતું અટકાવવા માટે હમણાં જ પ્લાન ખરીદો.',
      es: 'Tu prueba gratuita expira en {hours} hora(s). El monitoreo del menor se detendrá al vencer. Adquiere un plan para mantener la protección continua.',
      fr: 'Votre essai gratuit expire dans {hours} heure(s). La surveillance enfant s’arrêtera à expiration. Souscrivez un forfait pour continuer la protection.',
    },
  },
  TRIAL_EXPIRED: {
    title: {
      en: 'Free Trial Expired — Monitoring Stopped',
      hi: 'मुफ़्त ट्रायल समाप्त — मॉनिटरिंग बंद',
      gu: 'મફત ટ્રાયલ સમાપ્ત — મોનિટરિંગ બંધ',
      es: 'Prueba gratuita finalizada — Monitoreo detenido',
      fr: 'Essai gratuit terminé — Surveillance arrêtée',
    },
    body: {
      en: 'Your free trial has ended and child monitoring has stopped. Subscribe now to unlock unlimited live streaming and resume continuous 24/7 background child protection.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। असीमित लाइव स्ट्रीमिंग अनलॉक करने और 24/7 सुरक्षा पुनः शुरू करने के लिए अभी सदस्यता लें।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. અનલિમિટેડ લાઇવ સ્ટ્રીમિંગ અને 24/7 સુરક્ષા ફરી શરૂ કરવા માટે હમણાં જ પ્લાન ખરીદો.',
      es: 'Tu prueba gratuita ha finalizado y el monitoreo se ha detenido. Suscríbete ahora para desbloquear streaming en vivo ilimitado y reactivar la protección 24/7.',
      fr: 'Votre essai gratuit est terminé et la surveillance s’est arrêtée. Abonnez-vous pour débloquer le streaming illimité et réactiver la protection 24/7.',
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
      en: 'You have used {percent}% of your allocated cloud storage quota. Child device monitoring may stop soon! To keep monitoring running continuously without interruption, please clean storage or purchase a storage booster plan.',
      hi: 'आपने अपने आवंटित क्लाउड स्टोरेज कोटा का {percent}% उपयोग कर लिया है। बाल डिवाइस मॉनिटरिंग जल्द ही रुक सकती है! बिना किसी रुकावट के मॉनिटरिंग जारी रखने के लिए, कृपया स्टोरेज साफ़ करें या स्टोरेज बूस्टर प्लान खरीदें।',
      gu: 'તમે તમારા ક્લાઉડ સ્ટોરેજ ક્વોટામાંથી {percent}% નો ઉપયોગ કર્યો છે. બાળ ડિવાઇસનું મોનિટરિંગ ટૂંક સમયમાં બંધ થઈ શકે છે! કોઈપણ અડચણ વિના મોનિટરિંગ ચાલુ રાખવા માટે, કૃપા કરીને સ્ટોરેજ સાફ કરો અથવા સ્ટોરેજ બૂસ્ટર પ્લાન ખરીદો.',
      es: 'Has utilizado el {percent}% de tu cuota de almacenamiento en la nube. ¡El monitoreo del menor podría detenerse pronto! Para mantener el monitoreo continuo, limpia el almacenamiento o adquiere un refuerzo de almacenamiento.',
      fr: 'Vous avez utilisé {percent}% de votre quota de stockage cloud. La surveillance enfant pourrait s’arrêter bientôt ! Pour que la surveillance continue sans interruption, nettoyez le stockage ou souscrivez un pack de stockage.',
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
      en: 'Cloud Storage 100% Full — Monitoring Stopped!',
      hi: 'क्लाउड स्टोरेज 100% भर गया है — मॉनिटरिंग बंद!',
      gu: 'ક્લાઉડ સ્ટોરેજ ભરાઈ ગયું — મોનિટરિંગ બંધ!',
      es: 'Almacenamiento en la nube 100% lleno — ¡Monitoreo detenido!',
      fr: 'Stockage cloud 100% plein — Surveillance arrêtée !',
    },
    body: {
      en: 'Your cloud storage is 100% full and child monitoring has STOPPED! To restart monitoring immediately, please clean storage or purchase a storage booster plan.',
      hi: 'आपका क्लाउड स्टोरेज 100% भर गया है और बाल मॉनिटरिंग बंद हो गई है! मॉनिटरिंग तुरंत फिर से शुरू करने के लिए, कृपया स्टोरेज साफ़ करें या स्टोरेज बूस्टर प्लान खरीदें।',
      gu: 'તમારું ક્લાઉડ સ્ટોરેજ 100% ભરાઈ ગયું છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે! મોનિટરિંગ તરત જ ફરી શરૂ કરવા માટે, કૃપા કરીને સ્ટોરેજ સાફ કરો અથવા સ્ટોરેજ બૂસ્ટર પ્લાન ખરીદો.',
      es: '¡Tu almacenamiento en la nube está al 100% y el monitoreo del menor se ha DETENIDO! Para reiniciar el monitoreo de inmediato, limpia el almacenamiento o compra un plan de refuerzo.',
      fr: 'Votre stockage cloud est plein à 100% et la surveillance enfant s’est ARRÊTÉE ! Pour redémarrer immédiatement la surveillance, veuillez nettoyer le stockage ou souscrire un pack de stockage.',
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
  LIVE_SESSION_CUTOFF: {
    title: {
      en: 'Live Session Limit Reached',
      hi: 'लाइव सत्र सीमा समाप्त',
      gu: 'લાઇવ સેશન મર્યાદા પૂર્ણ',
      es: 'Límite de sesión en vivo alcanzado',
      fr: 'Limite de session en direct atteinte',
    },
    body: {
      en: 'Per-session live monitoring limit reached. Tap to start a new session.',
      hi: 'प्रति-सत्र लाइव निगरानी सीमा समाप्त हो गई है। नया सत्र शुरू करने के लिए टैप करें।',
      gu: 'દર સેશનની લાઇવ મોનિટરિંગ મર્યાદા પૂરી થઈ ગઈ છે. નવું સેશન શરૂ કરવા માટે ટૅપ કરો.',
      es: 'Se alcanzó el límite de sesión de monitoreo en vivo. Toca para iniciar una nueva sesión.',
      fr: 'Limite de session de surveillance en direct atteinte. Appuyez pour démarrer une nouvelle session.',
    },
  },
  PLAN_EXPIRED_GRACE: {
    title: {
      en: 'Plan Expired — Grace Period Active',
      hi: 'प्लान समाप्त — ग्रेस पीरियड सक्रिय',
      gu: 'પ્લાન સમાપ્ત — ગ્રેસ સમયગાળો સક્રિય',
      es: 'Plan expirado — Período de gracia activo',
      fr: 'Forfait expiré — Période de grâce active',
    },
    body: {
      en: 'Your subscription plan has expired and child monitoring has stopped. Your previously saved child data and history are safely held in grace period, but will be permanently deleted in {graceText}. Renew your plan now to prevent permanent data deletion and restart child monitoring.',
      hi: 'आपका सदस्यता प्लान समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। आपका पहले से सहेजा गया डेटा ग्रेस पीरियड में सुरक्षित है, लेकिन {graceText} में स्थायी रूप से हटा दिया जाएगा। डेटा हटाने से रोकने और मॉनिटरिंग फिर से शुरू करने के लिए अभी रिन्यू करें।',
      gu: 'તમારો સબ્સ્ક્રિપ્શન પ્લાન સમાપ્ત થઈ ગયો છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. તમારો અગાઉ સેવ કરેલો ડેટા અને ઇતિહાસ ગ્રેસ સમયગાળામાં સુરક્ષિત રાખવામાં આવ્યો છે, પરંતુ {graceText} માં કાયમ માટે ડિલીટ થઈ જશે. ડેટા ડિલીટ થતો અટકાવવા અને મોનિટરિંગ ફરી શરૂ કરવા માટે હમણાં જ રિન્યૂ કરો.',
      es: 'Tu plan de suscripción ha vencido y el monitoreo del menor se ha detenido. Los datos históricos se conservan de forma segura durante el período de gracia, pero se eliminarán permanentemente en {graceText}. Renueva tu plan ahora para evitar la eliminación y reiniciar el monitoreo.',
      fr: 'Votre forfait a expiré et la surveillance s’est arrêtée. Vos données sont conservées pendant le délai de grâce, mais seront définitivement supprimées dans {graceText}. Renouvelez maintenant pour éviter la perte de données et reprendre la surveillance.',
    },
  },
  TRIAL_EXPIRED_GRACE: {
    title: {
      en: 'Free Trial Expired (Grace Active)',
      hi: 'मुफ़्त ट्रायल समाप्त (ग्रेस पीरियड सक्रिय)',
      gu: 'મફત ટ્રાયલ સમાપ્ત (ગ્રેસ સમયગાળો સક્રિય)',
      es: 'Prueba gratuita expirada (gracia activa)',
      fr: 'Essai gratuit expiré (grâce active)',
    },
    body: {
      en: 'Your free trial plan has expired and child monitoring has stopped. Your previously saved child data and history are safely held in grace period, but will be permanently deleted in {graceText}. Renew your plan now to prevent permanent data deletion and restart child monitoring.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। आपका पहले से सहेजा गया डेटा ग्रेस पीरियड में सुरक्षित है, लेकिन {graceText} में स्थायी रूप से हटा दिया जाएगा। डेटा हटाने से रोकने और मॉनिटरिंग फिर से शुरू करने के लिए अभी रिन्यू करें।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. તમારો અગાઉ સેવ કરેલો ડેટા અને ઇતિહાસ ગ્રેસ સમયગાળામાં સુરક્ષિત છે, પરંતુ {graceText} માં કાયમ માટે ડિલીટ થઈ જશે. ડેટા ડિલીટ થતો અટકાવવા અને મોનિટરિંગ ફરી શરૂ કરવા માટે હમણાં જ રિન્યૂ કરો.',
      es: 'Tu prueba gratuita ha expirado y la monitorización se ha detenido. Todos los datos se eliminarán permanentemente en {graceText}. Renuévala ahora.',
      fr: 'Votre essai gratuit a expiré et la surveillance s’est arrêtée. Les données seront définitivement supprimées dans {graceText}. Renouvelez maintenant.',
    },
  },
  PLAN_EXPIRED_STOPPED: {
    title: {
      en: 'Plan Expired — Monitoring Stopped',
      hi: 'प्लान समाप्त — मॉनिटरिंग बंद',
      gu: 'પ્લાન સમાપ્ત — મોનિટરિંગ બંધ',
      es: 'Plan expirado — Monitorización detenida',
      fr: 'Forfait expiré — Surveillance arrêtée',
    },
    body: {
      en: 'Your subscription plan has expired and child monitoring has stopped. Renew your plan now to resume child monitoring. Child devices do not need to be repaired — they will automatically reconnect upon renewal.',
      hi: 'आपका सदस्यता प्लान समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। बाल मॉनिटरिंग फिर से शुरू करने के लिए अभी प्लान रिन्यू करें। बाल डिवाइस को फिर से पेयर करने की आवश्यकता नहीं है — वे रिन्यू होने पर स्वचालित रूप से पुनः कनेक्ट हो जाएंगे।',
      gu: 'તમારો સબ્સ્ક્રિપ્શન પ્લાન સમાપ્ત થઈ ગયો છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. બાળ મોનિટરિંગ ફરી શરૂ કરવા માટે હમણાં જ પ્લાન રિન્યૂ કરો. બાળ ડિવાઇસ ફરીથી કનેક્ટ કરવાની જરૂર નથી — રિન્યૂ થતાં જ તે આપમેળે ફરી કનેક્ટ થઈ જશે.',
      es: 'Tu plan de suscripción ha vencido y el monitoreo se ha detenido. Renueva tu plan ahora para reanudar el monitoreo. No es necesario volver a emparejar los dispositivos del menor: se reconectarán automáticamente al renovar.',
      fr: 'Votre forfait a expiré et la surveillance s’est arrêtée. Renouvelez votre forfait dès maintenant pour reprendre la surveillance. Inutile de reconnecter l’appareil enfant - il se reconnectera automatiquement une fois renouvelé.',
    },
  },
  TRIAL_EXPIRED_STOPPED: {
    title: {
      en: 'Free Trial Expired — Monitoring Stopped',
      hi: 'मुफ़्त ट्रायल समाप्त — मॉनिटरिंग बंद',
      gu: 'મફત ટ્રાયલ સમાપ્ત — મોનિટરિંગ બંધ',
      es: 'Prueba gratuita finalizada — Monitoreo detenido',
      fr: 'Essai gratuit terminé — Surveillance arrêtée',
    },
    body: {
      en: 'Your free trial has ended and child monitoring has stopped. Renew your plan now to resume child monitoring. Child devices do not need to be repaired — they will automatically reconnect upon renewal.',
      hi: 'आपका मुफ़्त ट्रायल समाप्त हो गया है और बाल मॉनिटरिंग बंद हो गई है। बाल सुरक्षा पुनः शुरू करने के लिए अभी प्लान रिन्यू करें। बाल डिवाइस फिर से कनेक्ट करने की आवश्यकता नहीं है — वे स्वतः जुड़ जाएंगे।',
      gu: 'તમારું મફત ટ્રાયલ પૂર્ણ થઈ ગયું છે અને બાળ મોનિટરિંગ બંધ થઈ ગયું છે. બાળ મોનિટરિંગ ફરી શરૂ કરવા માટે હમણાં જ પ્લાન ખરીદો. બાળ ડિવાઇસ ફરીથી કનેક્ટ કરવાની જરૂર નથી — રિન્યૂ થતાં જ તે આપમેળે કનેક્ટ થઈ જશે.',
      es: 'Tu prueba gratuita ha finalizado y el monitoreo se ha detenido. Renueva tu plan ahora para reanudar la protección.',
      fr: 'Votre essai gratuit est terminé et la surveillance s’est arrêtée. Renouvelez votre forfait pour continuer.',
    },
  },
  DEVICE_APP_REMOVED: {
    title: {
      en: 'Monitoring Stopped — App Removed',
      hi: 'मॉनिटरिंग बंद — ऐप हटा दी गई',
      gu: 'મોનિટરિંગ બંધ — ઍપ કાઢી નાખવામાં આવી',
      es: 'Monitoreo detenido — App eliminada',
      fr: 'Surveillance arrêtée — Application supprimée',
    },
    body: {
      en: '{deviceName} removed the app or cleared its data. Reconnect to resume — your data is safe.',
      hi: '{deviceName} ने ऐप को हटा दिया या डेटा साफ़ कर दिया। पुनः कनेक्ट करें — आपका डेटा सुरक्षित है।',
      gu: '{deviceName} એ ઍપ કાઢી નાખી અથવા ડેટા ક્લિયર કર્યો. ફરીથી કનેક્ટ કરો — તમારો ડેટા સુરક્ષિત છે.',
      es: '{deviceName} eliminó la app o borró sus datos. Reconecta para reanudar — tus datos están a salvo.',
      fr: '{deviceName} a supprimé l’application ou effacé ses données. Reconnectez pour reprendre — vos données sont en sécurité.',
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
  LIVE_SESSION_CUTOFF: 'LIVE_SESSION_CUTOFF',
  RECORDING_COMPLETED: 'RECORDING_COMPLETED',
  APP_REMOVED: 'DEVICE_APP_REMOVED',
  DEVICE_APP_REMOVED: 'DEVICE_APP_REMOVED',
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
