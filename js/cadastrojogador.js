'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // 1. INICIALIZAÇÃO E VERIFICAÇÃO
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        return console.error("Firebase ou utils.js não foram carregados.");
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;
    let newProfileImageFile = null;
    let currentMatchId = null; 

    // 2. ELEMENTOS DA UI
    const ui = {
        playerForm: document.getElementById('playerForm'),
        positionElements: document.querySelectorAll('.position'),
        positionHiddenInput: document.getElementById('player-position-hidden'),
        positionText: document.getElementById('selected-position-text'),
        photoInput: document.getElementById('player-photo-input'),
        photoPreview: document.getElementById('photo-preview'),
        playerNameInput: document.getElementById('player-name'),
        matchInfoDisplay: document.getElementById('match-info-display')
    };

    // 3. AUTENTICAÇÃO E LÓGICA DA PÁGINA
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

            loadMatchInfo();
            loadExistingProfileData();
        }
    });
    
    async function loadMatchInfo() {
        try {
            const matchDoc = await db.collection('partidas').doc(currentMatchId).get();
            if (matchDoc.exists) {
                const data = matchDoc.data();
                ui.matchInfoDisplay.innerHTML = `
                    <h3>Você está se inscrevendo em:</h3>
                    <p>${data.nome} (${data.local})</p>
                `;
            }
        } catch (error) {
            console.error("Erro ao carregar dados da partida:", error);
        }
    }

    async function loadExistingProfileData() {
        try {
            const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                applyTheme(data.theme || 'dark');
                ui.playerNameInput.value = data.nome || '';
                ui.photoPreview.src = data.fotoURL || 'imagens/perfil.png';
                if (data.idade) document.getElementById('player-age').value = data.idade;
                if (data.posicao) selectPosition(data.posicao);
            } else {
                applyTheme('dark');
            }
        } catch (error) {
            console.error("Erro ao carregar dados do perfil:", error);
        }
    }

    // 4. LÓGICA DA INTERFACE
    ui.positionElements.forEach(pos => {
        pos.addEventListener('click', () => {
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

    ui.photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            newProfileImageFile = file;
            const reader = new FileReader();
            reader.onload = (event) => { ui.photoPreview.src = event.target.result; };
            reader.readAsDataURL(file);
        }
    });

    ui.playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || !currentMatchId) {
            return showToast('Erro: Usuário ou partida não identificados.', 'error');
        }
        
        if (!ui.positionHiddenInput.value) {
            return showToast('Por favor, selecione sua posição na quadra!', 'error');
        }

        toggleLoading(true);

        try {
            const playerData = {
                userId: currentUser.uid, // <-- MUDANÇA IMPORTANTE AQUI
                nome: ui.playerNameInput.value,
                apelido: document.getElementById('player-nickname').value,
                idade: document.getElementById('player-age').value,
                posicao: ui.positionHiddenInput.value,
                cadastradoEm: firebase.firestore.FieldValue.serverTimestamp(),
                fotoURL: ui.photoPreview.src
            };
            
            if (newProfileImageFile) {
                const base64Image = await convertImageToBase64(newProfileImageFile);
                playerData.fotoURL = base64Image;
                await db.collection('usuarios').doc(currentUser.uid).set({ fotoURL: base64Image }, { merge: true });
            }

            await db.collection('partidas').doc(currentMatchId).collection('jogadores').doc(currentUser.uid).set(playerData);

            showToast('Cadastro na partida realizado com sucesso!', 'success');
            
            setTimeout(() => {
                window.location.href = 'inicio.html';
            }, 1500);

        } catch (error) {
            console.error("Erro ao cadastrar na partida:", error);
            showToast('Erro ao realizar o cadastro.', 'error');
        } finally {
            toggleLoading(false);
        }
    });
    
    // 5. FUNÇÕES AUXILIARES
    function applyTheme(theme) {
        document.body.classList.toggle('light-mode', theme === 'light');
    }
});