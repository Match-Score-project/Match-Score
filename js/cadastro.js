'use strict';

/**
 * @fileoverview Lógica para a página de cadastro (cadastro.html).
 * Gerencia a criação de novas contas com e-mail/senha e a integração
 * com o login do Google para preenchimento de dados.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // Verificação de dependências
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados corretamente.");
        showToast("Ocorreu um erro na página. Tente recarregar.", "error");
        return;
    }

    // Inicialização dos serviços Firebase
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Mapeamento dos elementos da UI
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

    // Variáveis para armazenar a imagem de perfil
    let selectedProfileFile = null;
    let googleProfilePhotoUrl = null;

    /**
     * Lida com a mudança no input de arquivo de imagem.
     * Exibe um preview da imagem selecionada.
     * @param {Event} event - O evento de mudança do input.
     */
    function handleProfileImageChange(event) {
        const file = event.target.files[0];
        if (file) {
            selectedProfileFile = file; // Armazena o arquivo
            googleProfilePhotoUrl = null; // Limpa a foto do Google, se houver
            const reader = new FileReader();
            reader.onload = e => {
                // Exibe a imagem no elemento de preview
                ui.profilePreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
    
    /**
     * Processa o envio do formulário de cadastro.
     * @param {Event} event - O evento de submit.
     */
    async function handleRegisterSubmit(event) {
        event.preventDefault();

        // Coleta e limpa os dados do formulário
        const { nome, email, data, posicao, senha, csenha, telefone } = {
            nome: ui.nomeInput.value.trim(),
            email: ui.emailInput.value.trim(),
            data: ui.dataInput.value,
            posicao: ui.posicaoInput.value,
            senha: ui.senhaInput.value,
            csenha: ui.csenhaInput.value,
            telefone: ui.telefoneInput.value.trim()
        };

        // Validações básicas dos campos
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

            // Verifica se o usuário já fez login com o Google
            if (currentUser && currentUser.providerData.some(p => p.providerId === 'google.com')) {
                isGoogleUser = true;
                // Vincula a nova senha à conta Google existente
                const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, senha);
                await currentUser.linkWithCredential(credential);
                user = currentUser;
            } else {
                // Cria um novo usuário com e-mail e senha
                const userCredential = await auth.createUserWithEmailAndPassword(email, senha);
                user = userCredential.user;
            }

            // Converte a imagem para Base64 se uma foi selecionada
            let imageToSave = null;
            if (selectedProfileFile) {
                imageToSave = await convertImageToBase64(selectedProfileFile);
            } else if (googleProfilePhotoUrl) {
                imageToSave = googleProfilePhotoUrl;
            }

            // Monta o objeto com os dados do usuário para salvar no Firestore
            const userData = {
                uid: user.uid,
                nome,
                nome_lowercase: nome.toLowerCase(), // Para buscas case-insensitive
                email: user.email,
                dataNascimento: data,
                posicao: posicao,
                telefone,
                fotoURL: imageToSave || '',
                googleV: isGoogleUser ? "Sim" : "Não", // Indica se a conta foi iniciada com Google
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Salva os dados no Firestore, na coleção 'usuarios', usando o UID do usuário como ID do documento
            await db.collection('usuarios').doc(user.uid).set(userData, { merge: true });

            showToast("Cadastro finalizado com sucesso!", "success");

            // Redireciona para a página de login após um breve intervalo
            setTimeout(() => {
                window.location.href = 'entrar.html';
            }, 1500);

        } catch (error) {
            console.error("Erro detalhado no cadastro:", error);
            // Tratamento de erros comuns do Firebase Auth
            let message = "Ocorreu um erro ao cadastrar. Verifique o console para detalhes.";
            switch (error.code) {
                case 'auth/email-already-in-use':
                case 'auth/credential-already-in-use':
                    message = "Este e-mail já está cadastrado ou vinculado a outra conta.";
                    break;
                // ... outros casos de erro
            }
            showToast(message, "error");
        } finally {
            toggleLoading(false);
        }
    }

    /**
     * Lida com o processo de "Continuar com Google".
     * Preenche os campos do formulário com os dados da conta Google.
     */
    async function handleGoogleSignIn() {
        if (auth.currentUser) await auth.signOut(); // Garante que não há sessão ativa
        
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            toggleLoading(true);
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            // Preenche os campos do formulário com os dados do Google
            ui.nomeInput.value = user.displayName || '';
            ui.emailInput.value = user.email || '';
            ui.emailInput.disabled = true; // Impede a edição do e-mail
            
            if (user.photoURL) {
                ui.profilePreview.src = user.photoURL;
                googleProfilePhotoUrl = user.photoURL;
                selectedProfileFile = null;
            }

            showToast("Dados importados! Crie uma senha e complete seu cadastro.", "info");
            ui.dataInput.focus(); // Move o foco para o próximo campo

        } catch (error) {
            console.error("Erro ao importar dados do Google:", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                showToast("Não foi possível entrar com o Google.", "error");
            }
        } finally {
            toggleLoading(false);
        }
    }

    // Adiciona os listeners aos elementos
    ui.form.addEventListener('submit', handleRegisterSubmit);
    ui.profileImageInput.addEventListener('change', handleProfileImageChange);
    ui.googleSignInButton.addEventListener('click', handleGoogleSignIn);

    // Adiciona a funcionalidade de mostrar/ocultar senha para ambos os campos de senha
    document.querySelectorAll('.toggle-password').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const passwordInput = toggle.previousElementSibling;
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggle.classList.toggle('fa-eye');
            toggle.classList.toggle('fa-eye-slash');
        });
    });
});