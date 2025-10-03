'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // ==============================================
    // INICIALIZAÇÃO E VARIÁVEIS
    // ==============================================
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;
    let currentMatchId = null;
    let isEditMode = false; // Nova variável para controlar o modo de edição

    const ui = {
        playerForm: document.getElementById('playerForm'),
        positionElements: document.querySelectorAll('.position'),
        positionHiddenInput: document.getElementById('player-position-hidden'),
        positionText: document.getElementById('selected-position-text'),
        photoPreview: document.getElementById('photo-preview'),
        playerNameInput: document.getElementById('player-name'),
        playerAgeInput: document.getElementById('player-age'),
        playerNicknameInput: document.getElementById('player-nickname'),
        matchInfoDisplay: document.getElementById('match-info-display'),
        fullMatchWarning: document.getElementById('full-match-warning'),
        submitBtn: document.getElementById('submit-btn'),
        tooltip: document.getElementById('position-tooltip'),
        pageTitle: document.querySelector('.main-container h2') // Elemento do título da página
    };

    // ==============================================
    // LÓGICA PRINCIPAL
    // ==============================================
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            const urlParams = new URLSearchParams(window.location.search);
            currentMatchId = urlParams.get('matchId');
            isEditMode = urlParams.get('edit') === 'true'; // Verifica se está em modo de edição
            
            if (!currentMatchId) {
                showToast('Partida inválida. Redirecionando...', 'error');
                setTimeout(() => { window.location.href = 'inicio.html'; }, 2000);
                return;
            }
            initializePage();
        }
    });

    async function initializePage() {
        toggleLoading(true);

        if (isEditMode) {
            ui.pageTitle.textContent = 'Alterar sua Inscrição';
            ui.submitBtn.textContent = 'Salvar Alterações';
        }

        try {
            const matchPromise = db.collection('partidas').doc(currentMatchId).get();
            const playersPromise = db.collection('partidas').doc(currentMatchId).collection('jogadores').get();
            const userPromise = db.collection('usuarios').doc(currentUser.uid).get();

            // Se estiver em modo de edição, busca também os dados da inscrição atual
            const playerRegistrationPromise = isEditMode
                ? db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid).get()
                : Promise.resolve(null);

            const [matchDoc, playersSnapshot, userDoc, playerRegDoc] = await Promise.all([
                matchPromise, playersPromise, userPromise, playerRegistrationPromise
            ]);

            if (userDoc.exists) {
                populateFormWithUserData(userDoc.data());
            }

            if (isEditMode && playerRegDoc && playerRegDoc.exists) {
                // Preenche o formulário com dados da inscrição (apelido e posição)
                const registrationData = playerRegDoc.data();
                ui.playerNicknameInput.value = registrationData.apelido || '';
                if (registrationData.posicao) {
                    selectPosition(registrationData.posicao);
                }
            }

            if (!matchDoc.exists) {
                showToast('Partida não encontrada.', 'error'); return;
            }
            const matchData = matchDoc.data();
            loadMatchInfo(matchData);

            const maxPlayers = matchData.vagasTotais || 14; 
            const dynamicPositionLimit = Math.ceil(maxPlayers / 5); 

            if (playersSnapshot.size >= maxPlayers && !isEditMode) { // Não bloqueia se estiver apenas editando
                ui.fullMatchWarning.textContent = `Partida lotada! Limite de ${maxPlayers} jogadores atingido.`;
                ui.fullMatchWarning.style.display = 'block';
                ui.submitBtn.disabled = true;
                ui.playerForm.style.opacity = '0.5';
            }

            const positionCounts = {};
            playersSnapshot.forEach(doc => {
                const position = doc.data().posicao;
                positionCounts[position] = (positionCounts[position] || 0) + 1;
            });
            
            updateCourtUI(positionCounts, dynamicPositionLimit);

        } catch (error) {
            console.error("Erro ao inicializar a página:", error);
            showToast('Erro ao carregar dados da página.', 'error');
        } finally {
            toggleLoading(false);
        }
    }
    
    // ==============================================
    // FUNÇÕES DE PREENCHIMENTO E UI
    // ==============================================
    function loadMatchInfo(data) {
        ui.matchInfoDisplay.innerHTML = `
            <h3>${isEditMode ? 'Você está alterando sua inscrição em:' : 'Você está se inscrevendo em:'}</h3>
            <p>${data.nome} (${data.local})</p>
        `;
    }

    function populateFormWithUserData(data) {
        ui.playerNameInput.value = data.nome || '';
        ui.photoPreview.src = data.fotoURL || 'imagens/perfil.png';
        if (data.dataNascimento) {
            ui.playerAgeInput.value = calculateAge(data.dataNascimento);
        }
    }
    
    function updateCourtUI(counts, positionLimit) {
        ui.positionElements.forEach(pos => {
            const positionName = pos.getAttribute('data-position');
            const currentCount = counts[positionName] || 0;
            const availableSlots = positionLimit - currentCount;
            
            let isAvailable = availableSlots > 0;
            // Se estiver editando, a posição atual do jogador também é considerada "disponível" para ele
            if (isEditMode && ui.positionHiddenInput.value === positionName) {
                isAvailable = true;
            }

            pos.classList.remove('available', 'unavailable');
            pos.classList.add(isAvailable ? 'available' : 'unavailable');
            
            pos.onmousemove = (e) => {
                ui.tooltip.style.left = e.pageX + 15 + 'px';
                ui.tooltip.style.top = e.pageY + 15 + 'px';
            };
            pos.onmouseenter = () => {
                ui.tooltip.textContent = `${availableSlots > 0 ? availableSlots : 0} vaga(s) de ${positionLimit}`;
                ui.tooltip.style.display = 'block';
            };
            pos.onmouseleave = () => { ui.tooltip.style.display = 'none'; };
        });
    }

    ui.positionElements.forEach(pos => {
        pos.addEventListener('click', () => {
            if (pos.classList.contains('unavailable')) {
                // Permite clicar na própria posição se estiver editando
                if (isEditMode && pos.getAttribute('data-position') === ui.positionHiddenInput.value) {
                    // Não faz nada, apenas não mostra o erro
                } else {
                    showToast('Esta posição já está lotada!', 'error');
                    return;
                }
            }
            const positionName = pos.getAttribute('data-position');
            selectPosition(positionName);
        });
    });
    
    function selectPosition(positionName) {
        ui.positionElements.forEach(p => p.classList.remove('active'));
        const activePosition = document.querySelector(`.position[data-position="${positionName}"]`);
        if (activePosition) activePosition.classList.add('active');
        ui.positionHiddenInput.value = positionName;
        ui.positionText.textContent = positionName;
        ui.positionText.style.color = 'var(--success-color)';
    }

    // ==============================================
    // ENVIO DO FORMULÁRIO (CRIAR E ATUALIZAR)
    // ==============================================
    ui.playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !currentMatchId) return showToast('Erro: Usuário ou partida não identificados.', 'error');
        if (!ui.positionHiddenInput.value) return showToast('Por favor, selecione sua posição na quadra!', 'error');

        toggleLoading(true);

        const playerData = {
            userId: currentUser.uid,
            nome: ui.playerNameInput.value,
            apelido: ui.playerNicknameInput.value,
            idade: ui.playerAgeInput.value,
            posicao: ui.positionHiddenInput.value,
            fotoURL: ui.photoPreview.src
        };

        try {
            const playerDocRef = db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid);
            
            if (isEditMode) {
                // Apenas atualiza os campos que podem ser mudados
                await playerDocRef.update({
                    apelido: playerData.apelido,
                    posicao: playerData.posicao
                });
                showToast('Inscrição atualizada com sucesso!', 'success');
            } else {
                // Cria uma nova inscrição
                playerData.cadastradoEm = firebase.firestore.FieldValue.serverTimestamp();
                await playerDocRef.set(playerData);
                showToast('Cadastro na partida realizado com sucesso!', 'success');
            }
            
            setTimeout(() => { window.location.href = 'inicio.html'; }, 1500);

        } catch (error) {
            console.error("Erro ao salvar inscrição:", error);
            showToast('Erro ao salvar inscrição.', 'error');
        } finally {
            toggleLoading(false);
        }
    });
    
    // ==============================================
    // FUNÇÕES UTILITÁRIAS
    // ==============================================
    function calculateAge(birthdateString) {
        if (!birthdateString) return '';
        const birthDate = new Date(birthdateString + 'T00:00:00');
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }
});