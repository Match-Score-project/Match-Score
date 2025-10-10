'use strict';

/**
 * @fileoverview Lógica para a página de criação e edição de partidas (criar.html).
 * Permite que usuários autenticados criem novas partidas ou editem partidas existentes.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    if (typeof applyUserTheme === 'function') {
        applyUserTheme();
    }

    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        console.error("Firebase ou utils.js não foram carregados.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;
    let isEditMode = false;
    let currentMatchId = null;

    const ui = {
        form: document.getElementById('matchForm'),
        dateInput: document.getElementById('data'),
        imageInput: document.getElementById('imagemPartidaInput'),
        imagePreview: document.getElementById('imagePreview'),
        pageTitle: document.querySelector('.form-header h2'),
        submitButton: document.querySelector('.submit-btn'),
        matchIdInput: document.getElementById('matchIdInput')
    };

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
        ui.form.modalidade.value = data.modalidade || '';
        ui.form.tipo.value = data.tipo || '';
        ui.form.vagasTotais.value = data.vagasTotais || ''; 
        
        if (data.imagemURL) {
            ui.imagePreview.src = data.imagemURL;
            ui.imagePreview.style.display = 'block';
        }
    }
    
    const setupForm = () => {
        const todayDate = new Date();
        const year = todayDate.getFullYear();
        const month = String(todayDate.getMonth() + 1).padStart(2, '0');
        const day = String(todayDate.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        
        if (ui.dateInput) ui.dateInput.min = todayString;
        
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
        
        const partida = {
            nome: document.getElementById('nome').value,
            data: document.getElementById('data').value,
            hora: document.getElementById('hora').value,
            local: document.getElementById('local').value,
            modalidade: document.getElementById('modalidade').value,
            tipo: document.getElementById('tipo').value,
            vagasTotais: Number(document.getElementById('vagasTotais').value)
        };

        if (!partida.nome || !partida.data || !partida.hora || !partida.local || !partida.modalidade || !partida.tipo || !partida.vagasTotais) {
            return showToast("Por favor, preencha todos os campos obrigatórios.", "error");
        }

        // --- A LÓGICA DE VALIDAÇÃO QUE ESTAVA FALTANDO COMEÇA AQUI ---
        const minVagas = {
            futsal: 10,
            society: 14,
            campo: 22
        };

        const tipoSelecionado = partida.tipo;
        const vagasInformadas = partida.vagasTotais;

        if (minVagas[tipoSelecionado]) {
            const minimoExigido = minVagas[tipoSelecionado];
            if (vagasInformadas < minimoExigido) {
                showToast(`Para ${tipoSelecionado}, o número mínimo de vagas é ${minimoExigido}.`, "error");
                return; // Impede o código de continuar
            }
        }
        // --- FIM DA LÓGICA DE VALIDAÇÃO ---

        toggleLoading(true);

        try {
            const imageFile = ui.imageInput.files[0];
            if (imageFile) {
                partida.imagemURL = await convertImageToBase64(imageFile);
            }

            if (isEditMode) {
                partida.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('partidas').doc(currentMatchId).set(partida, { merge: true });
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

    setupForm();
});