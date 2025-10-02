'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // ==============================================
    // INICIALIZAÇÃO E VARIÁVEIS
    // ==============================================
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;
    let currentMatchId = null; 

    const ui = {
        playerForm: document.getElementById('playerForm'),
        positionElements: document.querySelectorAll('.position'),
        positionHiddenInput: document.getElementById('player-position-hidden'),
        positionText: document.getElementById('selected-position-text'),
        photoPreview: document.getElementById('photo-preview'),
        playerNameInput: document.getElementById('player-name'),
        playerAgeInput: document.getElementById('player-age'), // Novo elemento
        playerNicknameInput: document.getElementById('player-nickname'),
        matchInfoDisplay: document.getElementById('match-info-display'),
        fullMatchWarning: document.getElementById('full-match-warning'),
        submitBtn: document.getElementById('submit-btn'),
        tooltip: document.getElementById('position-tooltip')
    };

    // ==============================================
    // LÓGICA PRINCIPAL
    // ==============================================
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            const urlParams = new URLSearchParams(window.location.search);
            currentMatchId = urlParams.get('matchId');
            
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
        try {
            const matchPromise = db.collection('partidas').doc(currentMatchId).get();
            const playersPromise = db.collection('partidas').doc(currentMatchId).collection('jogadores').get();
            const userPromise = db.collection('usuarios').doc(currentUser.uid).get();

            const [matchDoc, playersSnapshot, userDoc] = await Promise.all([matchPromise, playersPromise, userPromise]);

            if (userDoc.exists) {
                const userData = userDoc.data();
                populateFormWithUserData(userData); // Função principal para preencher os dados
            }

            if (!matchDoc.exists) {
                showToast('Partida não encontrada.', 'error');
                return;
            }
            const matchData = matchDoc.data();
            loadMatchInfo(matchData);

            const maxPlayers = matchData.vagasTotais || 14; 
            const dynamicPositionLimit = Math.ceil(maxPlayers / 5); 

            if (playersSnapshot.size >= maxPlayers) {
                ui.fullMatchWarning.textContent = `Partida lotada! Limite de ${maxPlayers} jogadores atingido.`;
                ui.fullMatchWarning.style.display = 'block';
                ui.submitBtn.disabled = true;
                ui.playerForm.style.opacity = '0.5';
            }

            const positionCounts = { "Goleiro": 0, "Fixo": 0, "Ala Direita": 0, "Ala Esquerda": 0, "Pivô": 0 };
            playersSnapshot.forEach(doc => {
                const position = doc.data().posicao;
                if (position in positionCounts) {
                    positionCounts[position]++;
                }
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
            <h3>Você está se inscrevendo em:</h3>
            <p>${data.nome} (${data.local})</p>
        `;
    }

    function populateFormWithUserData(data) {
        ui.playerNameInput.value = data.nome || '';
        ui.photoPreview.src = data.fotoURL || 'imagens/perfil.png';
        
        // Calcula e preenche a idade
        if (data.dataNascimento) {
            const age = calculateAge(data.dataNascimento);
            ui.playerAgeInput.value = age;
        }

        // Pré-seleciona a posição se o usuário tiver uma definida no perfil
        if (data.posicao) {
            // Verifica se a posição do perfil ainda está disponível na partida
            const prefferedPositionElement = document.querySelector(`.position[data-position="${data.posicao}"]`);
            if (prefferedPositionElement && prefferedPositionElement.classList.contains('available')) {
                selectPosition(data.posicao);
            }
        }
    }
    
    function updateCourtUI(counts, positionLimit) {
        ui.positionElements.forEach(pos => {
            const positionName = pos.getAttribute('data-position');
            const currentCount = counts[positionName] || 0;
            const availableSlots = positionLimit - currentCount;

            pos.classList.remove('available', 'unavailable');

            if (availableSlots > 0) {
                pos.classList.add('available');
            } else {
                pos.classList.add('unavailable');
            }

            pos.onmousemove = (e) => {
                ui.tooltip.style.left = e.pageX + 15 + 'px';
                ui.tooltip.style.top = e.pageY + 15 + 'px';
            };
            
            pos.onmouseenter = () => {
                ui.tooltip.textContent = `${availableSlots > 0 ? availableSlots : 0} vaga(s) de ${positionLimit}`;
                ui.tooltip.style.display = 'block';
            };

            pos.onmouseleave = () => {
                ui.tooltip.style.display = 'none';
            };
        });
    }

    ui.positionElements.forEach(pos => {
        pos.addEventListener('click', () => {
            if (pos.classList.contains('unavailable')) {
                showToast('Esta posição já está lotada!', 'error');
                return;
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
    // ENVIO DO FORMULÁRIO
    // ==============================================
    ui.playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !currentMatchId) return showToast('Erro: Usuário ou partida não identificados.', 'error');
        if (!ui.positionHiddenInput.value) return showToast('Por favor, selecione sua posição na quadra!', 'error');

        toggleLoading(true);

        try {
            const playerData = {
                userId: currentUser.uid,
                nome: ui.playerNameInput.value,
                apelido: ui.playerNicknameInput.value,
                idade: ui.playerAgeInput.value,
                posicao: ui.positionHiddenInput.value,
                cadastradoEm: firebase.firestore.FieldValue.serverTimestamp(),
                fotoURL: ui.photoPreview.src // Pega a URL da foto já carregada
            };
            
            await db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid).set(playerData);
            showToast('Cadastro na partida realizado com sucesso!', 'success');
            setTimeout(() => { window.location.href = 'inicio.html'; }, 1500);

        } catch (error) {
            console.error("Erro ao cadastrar na partida:", error);
            showToast('Erro ao realizar o cadastro.', 'error');
        } finally {
            toggleLoading(false);
        }
    });
    
    // ==============================================
    // FUNÇÕES UTILITÁRIAS
    // ==============================================
    function calculateAge(birthdateString) {
        if (!birthdateString) return '';
        // Adiciona um fuso horário para evitar problemas de "um dia a menos"
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