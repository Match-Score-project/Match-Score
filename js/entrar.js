'use strict';

/**
 * @fileoverview Lógica para a página de login (entrar.html).
 * Gerencia a autenticação de usuários via e-mail/senha e Google,
 * além da funcionalidade de recuperação de senha.
 */
document.addEventListener('DOMContentLoaded', () => {

    // Verifica se as dependências (Firebase e utils) foram carregadas.
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados corretamente.");
        return showToast("Ocorreu um erro na página. Tente recarregar.", "error");
    }

    // Inicialização dos serviços Firebase
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Mapeamento dos elementos da interface do usuário (UI)
    const ui = {
        loginForm: document.getElementById('loginForm'),
        loadingScreen: document.getElementById('loading'),
        emailInput: document.getElementById('email'),
        senhaInput: document.getElementById('senha'),
        googleSignInButton: document.getElementById('google-signin'),
        recoverPasswordLink: document.getElementById('recuperar-senha')
    };

    /**
     * Alterna a visibilidade da tela de carregamento.
     * @param {boolean} show - True para exibir, false para ocultar.
     */
    function toggleLoading(show) {
        ui.loadingScreen.style.display = show ? 'flex' : 'none';
        document.body.style.cursor = show ? 'wait' : 'default';
    }

    /**
     * Lida com o login via E-mail e Senha.
     * @param {Event} event - O evento de submit do formulário.
     */
    async function handleEmailLogin(event) {
        event.preventDefault(); // Previne o recarregamento da página
        const email = ui.emailInput.value.trim();
        const password = ui.senhaInput.value;

        if (!email || !password) {
            return showToast("Por favor, preencha e-mail e senha.", "error");
        }
        
        toggleLoading(true);

        try {
            // Tenta autenticar o usuário com o Firebase Auth
            await auth.signInWithEmailAndPassword(email, password);
            localStorage.setItem('isLoggedIn', 'true'); // Armazena o estado de login
            window.location.href = 'inicio.html'; // Redireciona para a página principal
        } catch (error) {
            console.error("Erro no login:", error);
            let message = "Ocorreu um erro ao tentar fazer login.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                message = "E-mail ou senha incorretos.";
            }
            showToast(message, "error");
        } finally {
            toggleLoading(false);
        }
    }

    /**
     * Lida com o login via conta Google (popup).
     */
    async function handleGoogleLogin() {
        toggleLoading(true);
        const provider = new firebase.auth.GoogleAuthProvider();

        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            // Passo 1: Verifica se o usuário já existe no banco de dados 'usuarios' do Firestore.
            const userDocRef = db.collection('usuarios').doc(user.uid);
            const doc = await userDocRef.get();

            // Passo 2: Se o documento do usuário NÃO existir, significa que ele nunca se cadastrou na plataforma.
            if (!doc.exists) {
                showToast("Usuário não cadastrado. Crie uma conta antes de entrar.", "error");
                await auth.signOut(); // Desloga o usuário do Firebase Auth para evitar inconsistências
                toggleLoading(false);
                return; // Interrompe a função
            }

            // Passo 3: Se o usuário existe, permite o login.
            localStorage.setItem('isLoggedIn', 'true');
            window.location.href = 'inicio.html';

        } catch (error) {
            console.error("Erro no login com Google:", error);
            // Ignora o erro se o usuário simplesmente fechou o popup
            if (error.code !== 'auth/popup-closed-by-user') {
                showToast("Não foi possível entrar com o Google.", "error");
            }
            toggleLoading(false);
        }
    }

    /**
     * Lida com a solicitação de recuperação de senha.
     * @param {Event} event - O evento de clique no link.
     */
    async function handlePasswordRecovery(event) {
        event.preventDefault();
        const email = ui.emailInput.value.trim();

        if (!email) {
            return showToast("Por favor, digite seu e-mail para recuperar a senha.", "error");
        }
        
        toggleLoading(true);
        try {
            // Envia o e-mail de redefinição de senha para o endereço fornecido
            await auth.sendPasswordResetEmail(email);
            showToast("E-mail de recuperação enviado! Verifique sua caixa de entrada.", "success");
        } catch (error) {
            console.error("Erro ao recuperar senha:", error);
            showToast("Não foi possível enviar o e-mail de recuperação.", "error");
        } finally {
            toggleLoading(false);
        }
    }

     // Adiciona os listeners para os eventos de clique e submit
    ui.loginForm.addEventListener('submit', handleEmailLogin);
    ui.googleSignInButton.addEventListener('click', handleGoogleLogin);
    ui.recoverPasswordLink.addEventListener('click', handlePasswordRecovery);

    // Lógica para o botão de "mostrar/ocultar" senha
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword && ui.senhaInput) {
        togglePassword.addEventListener('click', () => {
            // Alterna o tipo do input entre 'password' e 'text'
            const type = ui.senhaInput.getAttribute('type') === 'password' ? 'text' : 'password';
            ui.senhaInput.setAttribute('type', type);

            // Alterna o ícone do olho (aberto/fechado)
            togglePassword.classList.toggle('fa-eye');
            togglePassword.classList.toggle('fa-eye-slash');
        });
    }
});