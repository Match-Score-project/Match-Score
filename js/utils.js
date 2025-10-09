'use strict';

/**
 * @fileoverview Funções utilitárias reutilizáveis em toda a aplicação.
 * Contém funções para exibir notificações (toasts), controlar a tela de carregamento,
 * converter imagens e aplicar o tema do usuário.
 */

/**
 * Exibe uma notificação flutuante (toast) na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} [type='info'] - O tipo de toast ('info', 'success', 'error'), que define sua cor.
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.error('O elemento #toast-container não foi encontrado no HTML.');
    return;
  }

  // Cria o elemento do toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Define um temporizador para remover o toast após 3 segundos
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Mostra ou esconde a tela de carregamento (loading overlay).
 * A visibilidade é controlada adicionando ou removendo a classe 'visible'.
 * @param {boolean} show - `true` para mostrar a tela de carregamento, `false` para esconder.
 */
function toggleLoading(show) {
    const loadingOverlay = document.getElementById('loading');
    if (loadingOverlay) {
        loadingOverlay.classList.toggle('visible', show);
    }
}

/**
 * Converte um arquivo de imagem para o formato Base64.
 * Útil para salvar imagens diretamente no Firestore ou para preview.
 * @param {File} file - O arquivo de imagem a ser convertido.
 * @returns {Promise<string>} Uma promessa que resolve com a string Base64 da imagem.
 */
function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result); // Retorna a string base64
        reader.onerror = error => reject(error);
    });
}

/**
 * Carrega a preferência de tema (claro/escuro) do usuário a partir do Firestore
 * e a aplica ao corpo (body) do documento.
 */
async function applyUserTheme() {
    // Garante que o Firebase e o serviço de Autenticação estejam prontos
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            const db = firebase.firestore();
            // Busca o documento do usuário logado na coleção 'usuarios'
            db.collection('usuarios').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    
                    // Se o tema salvo for 'light', adiciona a classe 'light-mode' ao body.
                    // Caso contrário (se for 'dark' ou indefinido), remove a classe.
                    if (userData.theme === 'light') {
                        document.body.classList.add('light-mode');
                    } else {
                        document.body.classList.remove('light-mode');
                    }
                }
            }).catch(error => {
                console.error("Erro ao buscar tema do usuário:", error);
            });
        }
    });
}