'use strict';

document.addEventListener('DOMContentLoaded', () => {

    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados corretamente.");
        return showToast("Ocorreu um erro na página. Tente recarregar.", "error");
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    const ui = {
        loginForm: document.getElementById('loginForm'),
        loadingScreen: document.getElementById('loading'),
        emailInput: document.getElementById('email'),
        senhaInput: document.getElementById('senha'),
        googleSignInButton: document.getElementById('google-signin'),
        recoverPasswordLink: document.getElementById('recuperar-senha')
    };

    function toggleLoading(show) {
        ui.loadingScreen.style.display = show ? 'flex' : 'none';
        document.body.style.cursor = show ? 'wait' : 'default';
    }

    /**
     * Lida com o login via E-mail e Senha.
     */
    async function handleEmailLogin(event) {
        event.preventDefault();
        const email = ui.emailInput.value.trim();
        const password = ui.senhaInput.value;

        if (!email || !password) {
            return showToast("Por favor, preencha e-mail e senha.", "error");
        }
        
        toggleLoading(true);

        try {
            await auth.signInWithEmailAndPassword(email, password);
            localStorage.setItem('isLoggedIn', 'true'); // Define o estado de login
            window.location.href = 'inicio.html';
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
     * Lida com o login via Google.
     */
    async function handleGoogleLogin() {
        toggleLoading(true);
        const provider = new firebase.auth.GoogleAuthProvider();

        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            // Verifica se o usuário já existe no Firestore. Se não, cria um registro básico.
            const userDocRef = db.collection('usuarios').doc(user.uid);
            const doc = await userDocRef.get();
            if (!doc.exists) {
                await userDocRef.set({
                    uid: user.uid,
                    nome: user.displayName,
                    email: user.email,
                    fotoURL: user.photoURL,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            localStorage.setItem('isLoggedIn', 'true');
            window.location.href = 'inicio.html';
        } catch (error) {
            console.error("Erro no login com Google:", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                showToast("Não foi possível entrar com o Google.", "error");
            }
            toggleLoading(false);
        }
    }

    /**
     * Lida com a recuperação de senha.
     */
    async function handlePasswordRecovery(event) {
        event.preventDefault();
        const email = ui.emailInput.value.trim();

        if (!email) {
            return showToast("Por favor, digite seu e-mail para recuperar a senha.", "error");
        }
        
        toggleLoading(true);
        try {
            await auth.sendPasswordResetEmail(email);
            showToast("E-mail de recuperação enviado! Verifique sua caixa de entrada.", "success");
        } catch (error) {
            console.error("Erro ao recuperar senha:", error);
            showToast("Não foi possível enviar o e-mail de recuperação.", "error");
        } finally {
            toggleLoading(false);
        }
    }

    // Adiciona os event listeners
    ui.loginForm.addEventListener('submit', handleEmailLogin);
    ui.googleSignInButton.addEventListener('click', handleGoogleLogin);
    ui.recoverPasswordLink.addEventListener('click', handlePasswordRecovery);
});