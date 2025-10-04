'use strict';

/**
 * Exibe uma notificação flutuante (toast) na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} [type='info'] - O tipo de toast ('info', 'success', 'error').
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.error('O elemento #toast-container não foi encontrado no HTML.');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remove o toast após 3 segundos
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Mostra ou esconde a tela de carregamento (loading overlay).
 * @param {boolean} show - `true` para mostrar, `false` para esconder.
 */
function toggleLoading(show) {
    const loadingOverlay = document.getElementById('loading');
    if (loadingOverlay) {
        // Usamos a classe 'visible' para controlar a exibição
        loadingOverlay.classList.toggle('visible', show);
    }
}

/**
 * Converte um arquivo de imagem para o formato Base64.
 * @param {File} file - O arquivo de imagem a ser convertido.
 * @returns {Promise<string>} Uma promessa que resolve com a string Base64 da imagem.
 */
function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
/**
 * Carrega o tema do usuário do Firestore e o aplica à página.
 */
async function applyUserTheme() {
    // Garante que o Firebase e o Auth estejam prontos
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            const db = firebase.firestore();
            db.collection('usuarios').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    
                    // LÓGICA CORRIGIDA ABAIXO
                    if (userData.theme === 'light') {
                        // Se o tema for 'light', ADICIONA a classe
                        document.body.classList.add('light-mode');
                    } else {
                        // Caso contrário (se for 'dark' ou indefinido), REMOVE a classe
                        document.body.classList.remove('light-mode');
                    }
                }
            }).catch(error => {
                console.error("Erro ao buscar tema do usuário:", error);
            });
        }
    });
}