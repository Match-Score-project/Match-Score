'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // 1. INICIALIZAÇÃO E VERIFICAÇÃO
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    let isEditMode = false;
    let currentMatchId = null;

    // 2. ELEMENTOS DA UI
    const ui = {
        form: document.getElementById('matchForm'),
        dateInput: document.getElementById('data'),
        imageInput: document.getElementById('imagemPartidaInput'),
        imagePreview: document.getElementById('imagePreview'),
        pageTitle: document.querySelector('.form-header h2'),
        submitButton: document.querySelector('.submit-btn'),
        matchIdInput: document.getElementById('matchIdInput')
    };

    // 3. AUTENTICAÇÃO E LÓGICA DA PÁGINA
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            checkForEditMode();
        }
    });

    async function checkForEditMode() {
        const urlParams = new URLSearchParams(window.location.search);
        currentMatchId = urlParams.get('id');

        if (currentMatchId) {
            isEditMode = true;
            ui.matchIdInput.value = currentMatchId;
            
            ui.pageTitle.textContent = 'Editar Partida';
            ui.submitButton.textContent = 'Salvar Alterações';

            try {
                const doc = await db.collection('partidas').doc(currentMatchId).get();
                if (doc.exists) {
                    fillFormWithMatchData(doc.data());
                } else {
                    showToast('Partida não encontrada.', 'error');
                    window.location.href = 'inicio.html';
                }
            } catch (error) {
                console.error("Erro ao buscar dados da partida:", error);
                showToast('Erro ao carregar dados da partida.', 'error');
            }
        }
    }

    function fillFormWithMatchData(data) {
        ui.form.nome.value = data.nome || '';
        ui.form.data.value = data.data || '';
        ui.form.hora.value = data.hora || '';
        ui.form.local.value = data.local || '';
        ui.form.modalidade.value = data.modalidade || ''; // Campo renomeado
        ui.form.tipo.value = data.tipo || ''; // Novo campo de quadra
        ui.form.vagasTotais.value = data.vagasTotais || ''; 
        
        if (data.imagemURL) {
            ui.imagePreview.src = data.imagemURL;
            ui.imagePreview.style.display = 'block';
        }
    }
    
    // 4. LÓGICA DO FORMULÁRIO (CRIAR E ATUALIZAR)
    const setupForm = () => {
        const today = new Date().toISOString().split('T')[0];
        if (ui.dateInput) ui.dateInput.min = today;
        if (ui.form) ui.form.addEventListener('submit', handleFormSubmit);
        if (ui.imageInput) ui.imageInput.addEventListener('change', previewImage);
    };

    function previewImage(event) {
        const file = event.target.files[0];
        if (file && ui.imagePreview) {
            const reader = new FileReader();
            reader.onload = e => {
                ui.imagePreview.src = e.target.result;
                ui.imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (!currentUser) {
            return showToast("Você precisa estar logado.", "error");
        }
        
        // Usar os IDs corretos para pegar os valores
        const partida = {
            nome: document.getElementById('nome').value,
            data: document.getElementById('data').value,
            hora: document.getElementById('hora').value,
            local: document.getElementById('local').value,
            modalidade: document.getElementById('modalidade').value, // Campo renomeado
            tipo: document.getElementById('tipo').value,             // Novo campo
            vagasTotais: Number(document.getElementById('vagasTotais').value)
        };

        if (!partida.nome || !partida.data || !partida.hora || !partida.local || !partida.modalidade || !partida.tipo || !partida.vagasTotais) {
            return showToast("Por favor, preencha todos os campos obrigatórios.", "error");
        }

        toggleLoading(true);

        try {
            const imageFile = ui.imageInput.files[0];
            if (imageFile) {
                partida.imagemURL = await convertImageToBase64(imageFile);
            }

            if (isEditMode) {
                partida.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').doc(currentMatchId).update(partida);
                showToast("Partida atualizada com sucesso!", "success");
            } else {
                partida.creatorId = currentUser.uid;
                partida.creatorName = currentUser.displayName || 'Usuário Anônimo';
                partida.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').add(partida);
                showToast("Partida criada com sucesso!", "success");
            }

            setTimeout(() => { window.location.href = 'inicio.html'; }, 1500);

        } catch (error) {
            console.error("Erro ao salvar partida: ", error);
            showToast("Não foi possível salvar a partida. Tente novamente.", "error");
        } finally {
            toggleLoading(false);
        }
    }

    // 5. INICIALIZAÇÃO DA PÁGINA
    setupForm();
});