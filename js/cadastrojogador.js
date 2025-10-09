'use strict';

/**
 * @fileoverview Lógica para a página de inscrição de um jogador em uma partida (cadastrojogador.html).
 * O jogador confirma seus dados e seleciona sua posição tática na quadra.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // Aplica o tema do usuário
    if (typeof applyUserTheme === 'function') {
        applyUserTheme();
    }
    
    // Inicialização dos serviços Firebase
    const auth = firebase.auth();
    const db = firebase.firestore();
    
    // Variáveis de estado
    let currentUser = null;
    let currentMatchId = null;
    let isEditMode = false; // Controla se o usuário está se inscrevendo ou editando a inscrição

    // Mapeamento dos elementos da UI
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
        pageTitle: document.querySelector('.main-container h2')
    };

    /**
     * Observador de autenticação. Inicia a página quando o usuário está logado.
     */
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            // Pega os parâmetros da URL (ID da partida e modo de edição)
            const urlParams = new URLSearchParams(window.location.search);
            currentMatchId = urlParams.get('matchId');
            isEditMode = urlParams.get('edit') === 'true';
            
            if (!currentMatchId) {
                showToast('Partida inválida. Redirecionando...', 'error');
                setTimeout(() => { window.location.href = 'inicio.html'; }, 2000);
                return;
            }
            initializePage();
        } else {
            // Redireciona para o login se não estiver autenticado
            window.location.href = 'entrar.html';
        }
    });

    /**
     * Função principal que carrega todos os dados necessários para a página.
     */
    async function initializePage() {
        toggleLoading(true);

        // Ajusta a UI se estiver no modo de edição
        if (isEditMode) {
            ui.pageTitle.textContent = 'Alterar sua Inscrição';
            ui.submitBtn.textContent = 'Salvar Alterações';
        }

        try {
            // Executa todas as buscas de dados em paralelo para otimizar o carregamento
            const matchPromise = db.collection('partidas').doc(currentMatchId).get();
            const playersPromise = db.collection('partidas').doc(currentMatchId).collection('jogadores').get();
            const userPromise = db.collection('usuarios').doc(currentUser.uid).get();
            const playerRegistrationPromise = isEditMode
                ? db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid).get()
                : Promise.resolve(null);

            const [matchDoc, playersSnapshot, userDoc, playerRegDoc] = await Promise.all([
                matchPromise, playersPromise, userPromise, playerRegistrationPromise
            ]);

            // Preenche o formulário com os dados do perfil do usuário
            if (userDoc.exists) {
                populateFormWithUserData(userDoc.data());
            }

            // Se estiver editando, preenche com os dados da inscrição anterior
            if (isEditMode && playerRegDoc && playerRegDoc.exists) {
                const registrationData = playerRegDoc.data();
                ui.playerNicknameInput.value = registrationData.apelido || '';
                if (registrationData.posicao) {
                    selectPosition(registrationData.posicao);
                }
            }
            
            // Carrega e exibe as informações da partida
            if (!matchDoc.exists) {
                showToast('Partida não encontrada.', 'error'); return;
            }
            const matchData = matchDoc.data();
            loadMatchInfo(matchData);

            // Verifica se a partida está lotada
            const maxPlayers = matchData.vagasTotais || 14;
            if (playersSnapshot.size >= maxPlayers && !isEditMode) {
                ui.fullMatchWarning.textContent = `Partida lotada! Limite de ${maxPlayers} jogadores atingido.`;
                ui.fullMatchWarning.style.display = 'block';
                ui.submitBtn.disabled = true;
                ui.playerForm.style.opacity = '0.5';
            }
            
            // Calcula o limite dinâmico de jogadores por posição
            const dynamicPositionLimit = Math.ceil(maxPlayers / 5); 

            // Conta quantos jogadores já estão inscritos em cada posição
            const positionCounts = {};
            playersSnapshot.forEach(doc => {
                const position = doc.data().posicao;
                positionCounts[position] = (positionCounts[position] || 0) + 1;
            });
            
            // Atualiza a UI da quadra com as vagas disponíveis
            updateCourtUI(positionCounts, dynamicPositionLimit);

        } catch (error) {
            console.error("Erro ao inicializar a página:", error);
            showToast('Erro ao carregar dados da página.', 'error');
        } finally {
            toggleLoading(false);
        }
    }
    
    /**
     * Exibe as informações da partida no topo da página.
     * @param {object} data - Dados da partida.
     */
    function loadMatchInfo(data) {
        ui.matchInfoDisplay.innerHTML = `
            <h3>${isEditMode ? 'Você está alterando sua inscrição em:' : 'Você está se inscrevendo em:'}</h3>
            <p>${data.nome} (${data.local})</p>
        `;
    }

    /**
     * Preenche os campos do formulário com os dados do perfil do usuário.
     * @param {object} data - Dados do usuário.
     */
    function populateFormWithUserData(data) {
        ui.playerNameInput.value = data.nome || '';
        ui.photoPreview.src = data.fotoURL || 'imagens/perfil.png';
        if (data.dataNascimento) {
            ui.playerAgeInput.value = calculateAge(data.dataNascimento);
        }
    }
    
    /**
     * Atualiza a aparência dos pinos de posição na quadra (disponível/indisponível).
     * @param {object} counts - Objeto com a contagem de jogadores por posição.
     * @param {number} positionLimit - Número máximo de jogadores por posição.
     */
    function updateCourtUI(counts, positionLimit) {
        ui.positionElements.forEach(pos => {
            const positionName = pos.getAttribute('data-position');
            const currentCount = counts[positionName] || 0;
            const availableSlots = positionLimit - currentCount;
            
            let isAvailable = availableSlots > 0;
            // Permite selecionar a própria posição no modo de edição, mesmo que esteja lotada
            if (isEditMode && ui.positionHiddenInput.value === positionName) {
                isAvailable = true;
            }

            pos.classList.remove('available', 'unavailable');
            pos.classList.add(isAvailable ? 'available' : 'unavailable');
            
            // Configura o tooltip que mostra o número de vagas
            pos.onmouseenter = () => {
                ui.tooltip.textContent = `${availableSlots > 0 ? availableSlots : 0} vaga(s) de ${positionLimit}`;
                ui.tooltip.style.display = 'block';
            };
            pos.onmousemove = (e) => {
                ui.tooltip.style.left = e.pageX + 15 + 'px';
                ui.tooltip.style.top = e.pageY + 15 + 'px';
            };
            pos.onmouseleave = () => { ui.tooltip.style.display = 'none'; };
        });
    }

    /**
     * Seleciona uma posição na quadra, atualizando a UI e o valor do input escondido.
     * @param {string} positionName - O nome da posição selecionada (ex: "Goleiro").
     */
    function selectPosition(positionName) {
        ui.positionElements.forEach(p => p.classList.remove('active'));
        const activePosition = document.querySelector(`.position[data-position="${positionName}"]`);
        if (activePosition) activePosition.classList.add('active');
        
        ui.positionHiddenInput.value = positionName;
        ui.positionText.textContent = positionName;
        ui.positionText.style.color = 'var(--success-color)';
    }

    // Adiciona o listener de clique para cada pino de posição na quadra
    ui.positionElements.forEach(pos => {
        pos.addEventListener('click', () => {
            if (pos.classList.contains('unavailable') && !(isEditMode && pos.getAttribute('data-position') === ui.positionHiddenInput.value)) {
                showToast('Esta posição já está lotada!', 'error');
                return;
            }
            const positionName = pos.getAttribute('data-position');
            selectPosition(positionName);
        });
    });
    
    /**
     * Lida com o envio do formulário, salvando a inscrição ou a alteração no Firestore.
     */
    ui.playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
                // Atualiza apenas os campos que podem ser alterados
                await playerDocRef.update({
                    apelido: playerData.apelido,
                    posicao: playerData.posicao
                });
                showToast('Inscrição atualizada com sucesso!', 'success');
            } else {
                // Cria um novo documento de inscrição
                playerData.cadastradoEm = firebase.firestore.FieldValue.serverTimestamp();
                await playerDocRef.set(playerData);
                
                // Armazena dados na sessionStorage para exibir um toast de sucesso na próxima página
                const matchInfo = await db.collection('partidas').doc(currentMatchId).get();
                sessionStorage.setItem('registrationSuccess', 'true');
                sessionStorage.setItem('matchName', matchInfo.data().nome);

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
    
    /**
     * Calcula a idade com base na data de nascimento.
     * @param {string} birthdateString - A data de nascimento no formato 'AAAA-MM-DD'.
     * @returns {number|string} A idade calculada ou uma string vazia se a data for inválida.
     */
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