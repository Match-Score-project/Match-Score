'use strict';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof applyUserTheme === 'function') {
        applyUserTheme();
    }
    
    // ==============================================
    // INICIALIZAÇÃO E VARIÁVEIS GLOBAIS
    // ==============================================
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;
    let currentMatchId = null;
    let isEditMode = false;

    const positionLimits = {
        'Goleiro': 2,
        'Zagueiro': 4,
        'Lateral Direito': 2,
        'Lateral Esquerdo': 2,
        'Volante': 2,
        'Meio-Campo': 4,
        'Ponta Direita': 2,
        'Ponta Esquerda': 2,
        'Centro Avante': 2,
        // Posições de Futsal
        'Fixo': 2,
        'Ala Direita': 2,
        'Ala Esquerda': 2,
        'Pivô': 2,
        // Posições para Society
        'Ala': 4,
        'Atacante': 2
    };

    const courtConfigs = {
        futsal: {
            image: 'imagens/futsal.png',
            alt: 'Quadra de Futsal',
            positions: [
                { name: 'Goleiro', displayName: 'Goleiro', class: 'gk', top: '85%', left: '50%' },
                { name: 'Fixo', displayName: 'Fixo', class: 'fix', top: '65%', left: '50%' },
                { name: 'Ala-Direita', displayName: 'Ala Direita', class: 'ala-d', top: '45%', left: '78%' },
                { name: 'Ala-Esquerda', displayName: 'Ala Esquerda', class: 'ala-e', top: '45%', left: '22%' },
                { name: 'Pivô', displayName: 'Pivô', class: 'piv', top: '25%', left: '50%' }
            ]
        },
        campo: {
            image: 'imagens/campoC.png',
            alt: 'Campo de Futebol',
            positions: [
                { name: 'Goleiro', displayName: 'Goleiro', class: 'gk', top: '92%', left: '50%' },
                { name: 'Zagueiro-E', displayName: 'Zagueiro', class: 'zag-e', top: '75%', left: '30%' },
                { name: 'Zagueiro-D', displayName: 'Zagueiro', class: 'zag-d', top: '75%', left: '70%' },
                { name: 'Lateral-Direito', displayName: 'Lateral Direito', class: 'ld', top: '65%', left: '82%' },
                { name: 'Lateral-Esquerdo', displayName: 'Lateral Esquerdo', class: 'le', top: '65%', left: '18%' },
                { name: 'Volante', displayName: 'Volante', class: 'vol', top: '55%', left: '50%' },
                { name: 'Meio-Campo-E', displayName: 'Meio-Campo', class: 'mc-e', top: '40%', left: '35%' },
                { name: 'Meio-Campo-D', displayName: 'Meio-Campo', class: 'mc-d', top: '40%', left: '65%' },
                { name: 'Ponta-Direita', displayName: 'Ponta Direita', class: 'pd', top: '25%', left: '80%' },
                { name: 'Ponta-Esquerda', displayName: 'Ponta Esquerda', class: 'pe', top: '25%', left: '20%' },
                { name: 'Centro-Avante', displayName: 'Centro Avante', class: 'ata', top: '15%', left: '50%' }
            ]
        },
        society: {
            image: 'imagens/campoC.png',
            alt: 'Campo de Society',
            positions: [
                { name: 'Soc-Goleiro', displayName: 'Goleiro', class: 'gk', top: '92%', left: '50%' },
                { name: 'Soc-Zagueiro-E', displayName: 'Zagueiro', class: 'zag-e', top: '70%', left: '30%' },
                { name: 'Soc-Zagueiro-D', displayName: 'Zagueiro', class: 'zag-d', top: '70%', left: '70%' },
                { name: 'Soc-Ala-Esquerdo', displayName: 'Ala Esquerda', class: 'ala-e', top: '45%', left: '18%' },
                { name: 'Soc-Ala-Direito', displayName: 'Ala Direita', class: 'ala-d', top: '45%', left: '82%' },
                { name: 'Soc-Meio-Campo', displayName: 'Meio-Campo', class: 'mc-c', top: '50%', left: '50%' },
                { name: 'Soc-Atacante', displayName: 'Atacante', class: 'ata', top: '20%', left: '50%' }
            ]
        }
    };

    const ui = {
        playerForm: document.getElementById('playerForm'),
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
        pageTitle: document.querySelector('.main-container h2'),
        courtImage: document.getElementById('court-img'),
        positionsWrapper: document.getElementById('positions-wrapper'),
        // Adicionamos o container da quadra para manipular sua classe
        courtContainer: document.querySelector('.court-container')
    };
    
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
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
            window.location.href = 'entrar.html';
        }
    });

    async function initializePage() {
        toggleLoading(true);

        if (isEditMode) {
            ui.pageTitle.textContent = 'Alterar sua Inscrição';
            ui.submitBtn.textContent = 'Salvar Alterações';
        }

        try {
            const [matchDoc, playersSnapshot, userDoc, playerRegDoc] = await Promise.all([
                db.collection('partidas').doc(currentMatchId).get(),
                db.collection('partidas').doc(currentMatchId).collection('jogadores').get(),
                db.collection('usuarios').doc(currentUser.uid).get(),
                isEditMode ? db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid).get() : Promise.resolve(null)
            ]);

            if (userDoc.exists) {
                populateFormWithUserData(userDoc.data());
            }

            const matchData = matchDoc.data();
            const matchType = matchData.tipo || 'futsal';
            const config = courtConfigs[matchType] || courtConfigs.futsal;

            // --- INÍCIO DA CORREÇÃO DE COR ---
            // Remove qualquer classe de estilo anterior para garantir um estado limpo.
            ui.courtContainer.classList.remove('court-style-field');
            // Se o tipo for campo ou society, adiciona a classe que ativa o CSS que criamos.
            if (matchType === 'campo' || matchType === 'society') {
                ui.courtContainer.classList.add('court-style-field');
            }
            // --- FIM DA CORREÇÃO DE COR ---

            if (isEditMode && playerRegDoc && playerRegDoc.exists) {
                const registrationData = playerRegDoc.data();
                ui.playerNicknameInput.value = registrationData.apelido || '';
                if (registrationData.posicao) {
                    const savedPosition = config.positions.find(p => p.displayName === registrationData.posicao);
                    if (savedPosition) {
                        selectPosition(savedPosition.name, savedPosition.displayName);
                    }
                }
            }

            if (!matchDoc.exists) {
                showToast('Partida não encontrada.', 'error'); return;
            }
            
            loadMatchInfo(matchData);

            ui.courtImage.src = config.image;
            ui.courtImage.alt = config.alt;
            
            ui.positionsWrapper.innerHTML = '';
            config.positions.forEach(pos => {
                const posDiv = document.createElement('div');
                posDiv.className = `position position-${pos.class}`;
                posDiv.dataset.position = pos.name;
                posDiv.dataset.displayName = pos.displayName;
                posDiv.style.top = pos.top;
                posDiv.style.left = pos.left;
                ui.positionsWrapper.appendChild(posDiv);
            });

            if (playersSnapshot.size >= matchData.vagasTotais && !isEditMode) {
                ui.fullMatchWarning.textContent = `Partida lotada! Limite de ${matchData.vagasTotais} jogadores atingido.`;
                ui.fullMatchWarning.style.display = 'block';
                ui.submitBtn.disabled = true;
                ui.playerForm.style.opacity = '0.5';
            }

            const positionCounts = {};
            playersSnapshot.forEach(doc => {
                const positionName = doc.data().posicao;
                positionCounts[positionName] = (positionCounts[positionName] || 0) + 1;
            });
            
            updateCourtUI(positionCounts);
            setupPositionListeners();

        } catch (error) {
            console.error("Erro ao inicializar a página:", error);
            showToast('Erro ao carregar dados da página.', 'error');
        } finally {
            toggleLoading(false);
        }
    }
    
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
    
    function updateCourtUI(counts) {
        const positionElements = document.querySelectorAll('.position');
        positionElements.forEach(pos => {
            const displayName = pos.dataset.displayName;
            
            const positionLimit = positionLimits[displayName] || 1; 

            const currentCount = counts[displayName] || 0;
            const availableSlots = positionLimit - currentCount;
            
            let isAvailable = availableSlots > 0;
            if (isEditMode && ui.positionHiddenInput.value === displayName) {
                isAvailable = true;
            }

            pos.classList.remove('available', 'unavailable');
            pos.classList.add(isAvailable ? 'available' : 'unavailable');
            
            pos.onmousemove = (e) => {
                const tooltip = ui.tooltip;
                // Trocamos pageX por clientX para a posição horizontal na tela
                tooltip.style.left = e.clientX + 15 + 'px';

                // Usamos clientY para a posição vertical e para a verificação
                if ((e.clientY + tooltip.offsetHeight + 20) > window.innerHeight) {
                    // Posiciona acima do cursor usando a coordenada da tela
                    tooltip.style.top = e.clientY - tooltip.offsetHeight - 10 + 'px';
                } else {
                    // Posiciona abaixo do cursor usando a coordenada da tela
                    tooltip.style.top = e.clientY + 15 + 'px';
                }
            };
            pos.onmouseenter = () => {
                ui.tooltip.textContent = `Vagas para ${displayName}: ${availableSlots > 0 ? availableSlots : 0} de ${positionLimit}`;
                ui.tooltip.style.display = 'block';
            };
            pos.onmouseleave = () => { ui.tooltip.style.display = 'none'; };
        });
    }

    function setupPositionListeners() {
        const positionElements = document.querySelectorAll('.position');
        positionElements.forEach(pos => {
            pos.addEventListener('click', () => {
                if (pos.classList.contains('unavailable')) {
                    if (isEditMode && pos.dataset.displayName === ui.positionHiddenInput.value) {
                         // Permite clicar
                    } else {
                        showToast(`Vagas para ${pos.dataset.displayName} esgotadas!`, 'error');
                        return;
                    }
                }
                selectPosition(pos.dataset.position, pos.dataset.displayName);
            });
        });
    }
    
    function selectPosition(positionId, displayName) {
        const positionElements = document.querySelectorAll('.position');
        positionElements.forEach(p => p.classList.remove('active'));

        const activePosition = document.querySelector(`.position[data-position="${positionId}"]`);
        if (activePosition) activePosition.classList.add('active');
        
        ui.positionHiddenInput.value = displayName;
        ui.positionText.textContent = displayName;
        ui.positionText.style.color = 'var(--success-color)';
    }
    
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
                await playerDocRef.update({
                    apelido: playerData.apelido,
                    posicao: playerData.posicao
                });
                showToast('Inscrição atualizada com sucesso!', 'success');
            } else {
                playerData.cadastradoEm = firebase.firestore.FieldValue.serverTimestamp();
                await playerDocRef.set(playerData);
                
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