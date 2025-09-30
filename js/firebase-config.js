// firebase-config.js

/**
 * ATENÇÃO: Este arquivo agora é a ÚNICA fonte para a configuração do Firebase.
 * Ele deve ser importado no HTML antes de qualquer outro script que use o Firebase.
 * * A função getFirebaseConfig() foi removida pois a inicialização será feita
 * de forma mais segura e modular nos scripts que a necessitam.
 */

const firebaseConfig = {
  apiKey: "AIzaSyAqsEZOt1_6qeQOFbcHksbGhkmjPF4kPGU",
  authDomain: "match-score-d70bf.firebaseapp.com",
  projectId: "match-score-d70bf",
  storageBucket: "match-score-d70bf.appspot.com",
  messagingSenderId: "411796120290",
  appId: "1:411796120290:web:53cd7c32ae07679b1274bb",
  measurementId: "G-099LQPZK76"
};

// Inicializa o Firebase de forma global para garantir que esteja disponível
// para todos os scripts que o necessitem.
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}