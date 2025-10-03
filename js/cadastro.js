'use strict';

document.addEventListener('DOMContentLoaded', () => {
    
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados corretamente.");
        showToast("Ocorreu um erro na página. Tente recarregar.", "error");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    const ui = {
        form: document.getElementById('registerForm'),
        loadingScreen: document.getElementById('loading'),
        profileImageInput: document.getElementById('profileImageInput'),
        profilePreview: document.getElementById('profilePreview'),
        googleSignInButton: document.getElementById('google-signin'),
        nomeInput: document.getElementById('nome'),
        emailInput: document.getElementById('email'),
        dataInput: document.getElementById('data'),
        posicaoInput: document.getElementById('posicao'),
        senhaInput: document.getElementById('senha'),
        csenhaInput: document.getElementById('Csenha'),
        telefoneInput: document.getElementById('telefone')
    };

    let selectedProfileFile = null;
    let googleProfilePhotoUrl = null;

    function toggleLoading(show) {
        ui.loadingScreen.style.display = show ? 'flex' : 'none';
        document.body.style.cursor = show ? 'wait' : 'default';
    }

    function convertImageToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    function handleProfileImageChange(event) {
        const file = event.target.files[0];
        if (file) {
            selectedProfileFile = file;
            googleProfilePhotoUrl = null;
            const reader = new FileReader();
            reader.onload = e => {
                ui.profilePreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
    
    async function handleRegisterSubmit(event) {
        event.preventDefault();

        const { nome, email, data, posicao, senha, csenha, telefone } = {
            nome: ui.nomeInput.value.trim(),
            email: ui.emailInput.value.trim(),
            data: ui.dataInput.value,
            posicao: ui.posicaoInput.value,
            senha: ui.senhaInput.value,
            csenha: ui.csenhaInput.value,
            telefone: ui.telefoneInput.value.trim()
        };

        if (!nome || !email || !data || !posicao || !senha || !csenha || !telefone) {
            return showToast("Por favor, preencha todos os campos.", "error");
        }
        if (senha !== csenha) {
            return showToast("As senhas não coincidem.", "error");
        }
        if (senha.length < 6) {
            return showToast("A senha deve ter no mínimo 6 caracteres.", "error");
        }

        toggleLoading(true);

        try {
            const currentUser = auth.currentUser;
            let user;
            let isGoogleUser = false;

            if (currentUser && currentUser.providerData.some(p => p.providerId === 'google.com')) {
                isGoogleUser = true;

                // A LINHA PROBLEMÁTICA FOI REMOVIDA DAQUI.
                // Não vamos mais re-autenticar com o pop-up.
                
                const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, senha);
                await currentUser.linkWithCredential(credential);
                user = currentUser;

            } else {
                const userCredential = await auth.createUserWithEmailAndPassword(email, senha);
                user = userCredential.user;
            }

            let imageToSave = null;
            if (selectedProfileFile) {
                imageToSave = await convertImageToBase64(selectedProfileFile);
            } else if (googleProfilePhotoUrl) {
                imageToSave = googleProfilePhotoUrl;
            }

            const userData = {
                uid: user.uid,
                nome,
                nome_lowercase: nome.toLowerCase(),
                email: user.email,
                dataNascimento: data,
                posicao: posicao,
                telefone,
                fotoURL: imageToSave || '',
                googleV: isGoogleUser ? "Sim" : "Não",
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('usuarios').doc(user.uid).set(userData, { merge: true });

            showToast("Cadastro finalizado com sucesso!", "success");

            setTimeout(() => {
                window.location.href = 'entrar.html';
            }, 1500);

        } catch (error) {
            console.error("Erro detalhado no cadastro:", error);
            let message = "Ocorreu um erro ao cadastrar. Verifique o console para detalhes.";

            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use':
                    case 'auth/credential-already-in-use':
                        message = "Este e-mail já está cadastrado ou vinculado a outra conta.";
                        break;
                    case 'auth/invalid-email':
                        message = "O formato do e-mail é inválido.";
                        break;
                    case 'auth/weak-password':
                        message = "A senha é muito fraca. Use pelo menos 6 caracteres.";
                        break;
                    case 'auth/requires-recent-login':
                        message = "Sua sessão expirou por segurança. Por favor, faça o login com Google novamente e preencha a senha.";
                        break;
                    default:
                        message = `Erro do servidor: ${error.message}`;
                        break;
                }
            }
            showToast(message, "error");
        } finally {
            toggleLoading(false);
        }
    }

    async function handleGoogleSignIn() {
        if (auth.currentUser) await auth.signOut();
        
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            toggleLoading(true);
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            ui.nomeInput.value = user.displayName || '';
            ui.emailInput.value = user.email || '';
            ui.emailInput.disabled = true; 
            
            if (user.photoURL) {
                ui.profilePreview.src = user.photoURL;
                googleProfilePhotoUrl = user.photoURL;
                selectedProfileFile = null;
            }

            showToast("Dados importados! Crie uma senha e complete seu cadastro.", "info");
            ui.dataInput.focus();

        } catch (error) {
            console.error("Erro ao importar dados do Google:", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                showToast("Não foi possível entrar com o Google.", "error");
            }
        } finally {
            toggleLoading(false);
        }
    }

    ui.form.addEventListener('submit', handleRegisterSubmit);
    ui.profileImageInput.addEventListener('change', handleProfileImageChange);
    ui.googleSignInButton.addEventListener('click', handleGoogleSignIn);
});