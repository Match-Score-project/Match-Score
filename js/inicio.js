'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // 1. INICIALIZAÇÃO E VARIÁVEIS GLOBAIS
    // =================================================================================
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        return console.error("Firebase ou utils.js não carregados.");
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    const ui = {
        sidebar: document.getElementById('sidebar'),
        profileInfoDiv: document.getElementById('profileInfo'),
        profilePicPreview: document.getElementById('profileImagePreview'),
        profileEditForm: document.getElementById('profileEditForm'),
        editProfileBtn: document.getElementById('editProfileBtn'),
        profileImageInputEdit: document.getElementById('profileImageInputEdit'),
        themeToggle: document.getElementById('themeToggle'),
        allMatchesGrid: document.getElementById('all-matches-grid'),
        carouselSlides: document.getElementById('slides'),
        myMatchesGrid: document.getElementById('my-matches-grid'),
        registeredMatchesGrid: document.getElementById('registered-matches-grid'),
        matchDetailsContent: document.getElementById('matchDetailsContent'),
        modalMatchTitle: document.getElementById('modalMatchTitle')
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loadUserProfile();
            fetchAndDisplayMatches();
            fetchAndDisplayMyMatches();
            fetchAndDisplayRegisteredMatches();
        }
    });

    // =================================================================================
    // 2. LÓGICA DAS PARTIDAS
    // =================================================================================

    // --- Lógica para Detalhes da Partida ---
    async function openMatchDetails(matchId) {
        if (!matchId) return;

        openModal('matchDetailsModal');
        ui.matchDetailsContent.innerHTML = '<p>Carregando detalhes da partida...</p>';
        ui.modalMatchTitle.textContent = 'Detalhes da Partida';

        try {
            const matchPromise = db.collection('partidas').doc(matchId).get();
            const playersPromise = db.collection('partidas').doc(matchId).collection('jogadores').orderBy('cadastradoEm').get();

            const [matchDoc, playersSnapshot] = await Promise.all([matchPromise, playersPromise]);

            if (!matchDoc.exists) {
                ui.matchDetailsContent.innerHTML = '<p>Partida não encontrada.</p>';
                return;
            }

            const matchData = matchDoc.data();
            ui.modalMatchTitle.textContent = matchData.nome;

            let playersHTML = '';
            if (playersSnapshot.empty) {
                playersHTML = '<p>Nenhum jogador cadastrado ainda.</p>';
            } else {
                playersSnapshot.forEach(playerDoc => {
                    const playerData = playerDoc.data();
                    playersHTML += `
                        <div class="player-item">
                            <img src="${playerData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="player-item-avatar">
                            <div class="player-item-info">
                                <span class="player-name">${playerData.nome}</span>
                                <span class="player-position">${playerData.posicao}</span>
                            </div>
                        </div>
                    `;
                });
            }

            ui.matchDetailsContent.innerHTML = `
                <div class="modal-match-info">
                    <p><strong>Data:</strong> ${formatDateToPtBr(matchData.data)} às ${matchData.hora}</p>
                    <p><strong>Local:</strong> ${matchData.local}</p>
                    <p><strong>Tipo:</strong> ${matchData.tipo}</p>
                </div>
                <div class="player-list-container">
                    <h4>Jogadores Confirmados (${playersSnapshot.size})</h4>
                    <div class="player-list">
                        ${playersHTML}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error("Erro ao buscar detalhes da partida:", error);
            ui.matchDetailsContent.innerHTML = '<p>Ocorreu um erro ao carregar os detalhes.</p>';
            showToast('Erro ao carregar detalhes.', 'error');
        }
    }

    // --- Busca de Partidas Gerais ---
    async function fetchAndDisplayMatches() {
        if (!ui.allMatchesGrid || !ui.carouselSlides) return;
        ui.allMatchesGrid.innerHTML = '<p>Carregando partidas...</p>';
        ui.carouselSlides.innerHTML = '';
        try {
            const snapshot = await db.collection('partidas').orderBy('criadoEm', 'desc').get();
            if (snapshot.empty) {
                ui.allMatchesGrid.innerHTML = '<p>Nenhuma partida encontrada. Crie a primeira!</p>';
                return;
            }
            ui.allMatchesGrid.innerHTML = '';
            let recentMatchesCount = 0;
            snapshot.forEach(doc => {
                const match = doc.data();
                const docId = doc.id;
                ui.allMatchesGrid.innerHTML += createMatchCard(match, docId);
                if (recentMatchesCount < 5) {
                    ui.carouselSlides.innerHTML += createCarouselSlide(match, docId);
                    recentMatchesCount++;
                }
            });
            setupCarousel();
        } catch (error) {
            console.error("Erro ao buscar partidas:", error);
            ui.allMatchesGrid.innerHTML = '<p>Erro ao carregar as partidas.</p>';
            showToast("Erro ao carregar partidas.", "error");
        }
    }

    // --- Busca de Partidas Criadas pelo Usuário ---
    async function fetchAndDisplayMyMatches() {
        if (!currentUser || !ui.myMatchesGrid) return;
        ui.myMatchesGrid.innerHTML = '<p>Carregando suas partidas...</p>';
        try {
            const snapshot = await db.collection('partidas')
                .where('creatorId', '==', currentUser.uid)
                .orderBy('criadoEm', 'desc')
                .get();
            if (snapshot.empty) {
                ui.myMatchesGrid.innerHTML = '<p>Você ainda não criou nenhuma partida.</p>';
                return;
            }
            ui.myMatchesGrid.innerHTML = '';
            snapshot.forEach(doc => {
                const match = doc.data();
                const docId = doc.id;
                ui.myMatchesGrid.innerHTML += createMyMatchCard(match, docId);
            });
        } catch (error) {
            console.error("Erro ao buscar 'Minhas Partidas':", error);
            ui.myMatchesGrid.innerHTML = '<p>Erro ao carregar suas partidas.</p>';
        }
    }

    // --- Busca de Partidas onde o Usuário se Cadastrou ---
    async function fetchAndDisplayRegisteredMatches() {
        if (!currentUser || !ui.registeredMatchesGrid) return;
        ui.registeredMatchesGrid.innerHTML = '<p>Buscando jogos em que você se cadastrou...</p>';
        try {
            const playerRegistrations = await db.collectionGroup('jogadores')
                .where('userId', '==', currentUser.uid)
                .get();

            if (playerRegistrations.empty) {
                ui.registeredMatchesGrid.innerHTML = '<p>Você não se cadastrou em nenhuma partida ainda.</p>';
                return;
            }
            ui.registeredMatchesGrid.innerHTML = '';
            for (const registrationDoc of playerRegistrations.docs) {
                const matchRef = registrationDoc.ref.parent.parent;
                const matchDoc = await matchRef.get();
                if (matchDoc.exists) {
                    const matchData = matchDoc.data();
                    const matchId = matchDoc.id;
                    ui.registeredMatchesGrid.innerHTML += createRegisteredMatchCard(matchData, matchId);
                }
            }
        } catch (error) {
            console.error("Erro ao buscar jogos cadastrados:", error);
            ui.registeredMatchesGrid.innerHTML = '<p>Ocorreu um erro ao buscar seus jogos.</p>';
            showToast('Erro ao buscar seus jogos.', 'error');
        }
    }

    // --- Funções de Criação de Cards ---
    function createMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jpg';
        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <h3>${match.nome}</h3>
                    <p>${formattedDate} - ${match.local}</p>
                    <div class="match-card-actions">
                        <button class="btn-details" onclick="openMatchDetails('${matchId}')">Ver Detalhes</button>
                        <button class="btn-cadastrar-match" onclick="cadastrarEmPartida('${matchId}')">Cadastrar</button>
                    </div>
                </div>
            </div>
        `;
    }

    function createCarouselSlide(match, matchId) {
        const imageUrl = match.imagemURL || 'imagens/campo.jpg';
        const tipoPartida = match.tipo.charAt(0).toUpperCase() + match.tipo.slice(1);
        return `
            <div class="slide" data-match-id="${matchId}">
                <img src="${imageUrl}" class="carrossel-img" alt="${match.nome}" onclick="openMatchDetails('${matchId}')">
                <div class="slide-content">
                    <h3 onclick="openMatchDetails('${matchId}')">${match.nome}</h3>
                    <p>${tipoPartida} - ${match.local}</p>
                    <button class="btn-cadastrar-match" onclick="cadastrarEmPartida('${matchId}')">Cadastrar</button>
                </div>
            </div>
        `;
    }

    function createMyMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jpg';
        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <h3>${match.nome}</h3>
                    <p>${formattedDate} - ${match.local}</p>
                    <div class="match-card-actions">
                        <button class="btn-details" onclick="openMatchDetails('${matchId}')">Ver Detalhes</button>
                        <div>
                            <button class="btn btn-secondary" onclick="editMatch('${matchId}')">Editar</button>
                            <button class="btn btn-danger" onclick="deleteMatch('${matchId}')">Excluir</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function createRegisteredMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jpg';
        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <h3>${match.nome}</h3>
                    <p>${formattedDate} - ${match.local}</p>
                    <div class="match-card-actions">
                        <button class="btn-details" onclick="openMatchDetails('${matchId}')">Ver Detalhes</button>
                        <button class="btn btn-danger" onclick="cancelarInscricao('${matchId}')">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
    }

    // --- Funções de Ação nas Partidas ---
    function cadastrarEmPartida(matchId) {
        if (!matchId) return showToast('ID da partida não encontrado.', 'error');
        window.location.href = `cadastrojogador.html?matchId=${matchId}`;
    }

    function editMatch(matchId) {
        window.location.href = `criar.html?id=${matchId}`;
    }

    function deleteMatch(matchId) {
        openConfirmModal('Excluir Partida', 'Você tem certeza?', async () => {
            toggleLoading(true);
            try {
                await db.collection('partidas').doc(matchId).delete();
                showToast('Partida excluída!', 'success');
                fetchAndDisplayMatches();
                fetchAndDisplayMyMatches();
            } catch (error) {
                console.error('Erro ao excluir partida:', error);
                showToast('Erro ao excluir.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }

    async function cancelarInscricao(matchId) {
        if (!currentUser) return;
        openConfirmModal('Cancelar Inscrição', 'Tem certeza?', async () => {
            toggleLoading(true);
            try {
                await db.collection('partidas').doc(matchId).collection('jogadores').doc(currentUser.uid).delete();
                showToast('Inscrição cancelada.', 'success');
                fetchAndDisplayRegisteredMatches();
            } catch (error) {
                console.error('Erro ao cancelar inscrição:', error);
                showToast('Erro ao cancelar.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }

    // =================================================================================
    // 3. CONTROLE DA UI (SIDEBAR, MODAIS, SEÇÕES)
    // =================================================================================
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
        if (document.querySelectorAll('.modal.active').length === 0) {
            document.body.style.overflow = 'auto';
        }
    }

    function openConfirmModal(title, message, onConfirmCallback) {
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmBtn = document.getElementById('confirmBtn');
        if (!confirmTitle || !confirmMessage || !confirmBtn) return;
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', () => {
            onConfirmCallback();
            closeModal('confirmModal');
        }, { once: true });
        openModal('confirmModal');
    }

    function toggleSidebar() {
        ui.sidebar.classList.toggle('active');
    }

    function showSection(sectionId) {
        document.querySelectorAll('.page-section').forEach(section => {
            section.style.display = 'none';
        });
        const content = document.getElementById(`${sectionId}-content`);
        if (content) content.style.display = 'block';
        if (window.innerWidth <= 768 && ui.sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }

    // =================================================================================
    // 4. LÓGICA DO PERFIL DO USUÁRIO
    // =================================================================================
    async function loadUserProfile() {
        if (!currentUser) return;
        try {
            const doc = await db.collection('usuarios').doc(currentUser.uid).get();
            if (doc.exists) {
                const data = doc.data();
                ui.profilePicPreview.src = data.fotoURL || 'imagens/perfil.png';
                ui.profileInfoDiv.innerHTML = `<p><strong>Nome:</strong> ${data.nome || ''}</p><p><strong>Email:</strong> ${data.email || ''}</p><p><strong>Telefone:</strong> ${data.telefone || ''}</p><p><strong>Data Nasc:</strong> ${formatDateToPtBr(data.dataNascimento) || ''}</p><p><strong>Posição:</strong> ${data.posicao || ''}</p>`;
                applyTheme(data.theme || 'dark');
            } else {
                showToast("Perfil não encontrado.", "error");
            }
        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
            showToast("Erro ao carregar seu perfil.", "error");
        }
    }

    function enterEditMode() {
        if (!currentUser) return;
        db.collection('usuarios').doc(currentUser.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('editNome').value = data.nome || '';
                document.getElementById('editEmail').value = data.email || '';
                document.getElementById('editTelefone').value = data.telefone || '';
                document.getElementById('editDataNascimento').value = data.dataNascimento || '';
                document.getElementById('editPosicao').value = data.posicao || '';
                ui.profileInfoDiv.style.display = 'none';
                ui.profileEditForm.style.display = 'block';
                ui.editProfileBtn.style.display = 'none';
            } else {
                showToast("Não foi possível carregar dados para edição.", 'error');
            }
        }).catch(error => console.error("Erro ao buscar perfil para edição: ", error));
    }

    function exitEditMode(forceReload = false) {
        ui.profileInfoDiv.style.display = 'block';
        ui.profileEditForm.style.display = 'none';
        ui.editProfileBtn.style.display = 'block';
        if (forceReload) loadUserProfile();
    }

    async function saveProfileChanges() {
        if (!currentUser) return;
        const dataToUpdate = {
            nome: document.getElementById('editNome').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            telefone: document.getElementById('editTelefone').value.trim(),
            dataNascimento: document.getElementById('editDataNascimento').value,
            posicao: document.getElementById('editPosicao').value
        };
        try {
            toggleLoading(true);
            await db.collection('usuarios').doc(currentUser.uid).set(dataToUpdate, { merge: true });
            showToast('Perfil atualizado com sucesso!', 'success');
            exitEditMode(true);
        } catch (error) {
            console.error('Erro ao salvar perfil:', error);
            showToast('Erro ao salvar perfil.', 'error');
        } finally {
            toggleLoading(false);
        }
    }

    async function handleProfileImageChange(event) {
        const file = event.target.files[0];
        if (!file || !currentUser) return;
        const base64Image = await convertImageToBase64(file);
        ui.profilePicPreview.src = base64Image;
        openConfirmModal('Salvar Nova Foto', 'Deseja definir esta imagem como sua nova foto?', async () => {
            toggleLoading(true);
            try {
                await db.collection('usuarios').doc(currentUser.uid).update({ fotoURL: base64Image });
                showToast('Foto atualizada com sucesso!', 'success');
            } catch (error) {
                console.error("Erro ao salvar a foto:", error);
                showToast('Erro ao salvar a foto.', 'error');
                loadUserProfile();
            } finally {
                toggleLoading(false);
            }
        });
        event.target.value = '';
    }

    // =================================================================================
    // 5. LÓGICA DAS CONFIGURAÇÕES (TEMA, LOGOUT)
    // =================================================================================
    function applyTheme(theme) {
        document.body.classList.toggle('light-mode', theme === 'light');
        ui.themeToggle.checked = (theme !== 'light');
    }

    ui.themeToggle.addEventListener('change', () => {
        const newTheme = ui.themeToggle.checked ? 'dark' : 'light';
        applyTheme(newTheme);
        if (currentUser) {
            db.collection('usuarios').doc(currentUser.uid).set({ theme: newTheme }, { merge: true });
        }
    });

    async function logout() {
        openConfirmModal('Sair da Conta', 'Você tem certeza que deseja sair?', async () => {
            try {
                await auth.signOut();
                window.location.href = 'index.html';
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
                showToast("Erro ao sair.", "error");
            }
        });
    }

    // =================================================================================
    // 6. LÓGICA DO CARROSSEL
    // =================================================================================
    function setupCarousel() {
        const slidesContainer = ui.carouselSlides;
        if (!slidesContainer || slidesContainer.children.length === 0) return;
        const btnAnterior = document.getElementById("btn-anterior");
        const btnProximo = document.getElementById("btn-proximo");
        const totalSlides = slidesContainer.children.length;
        let slideAtual = 0;
        const getSlidesVisiveis = () => window.innerWidth <= 480 ? 1 : (window.innerWidth <= 768 ? 2 : 4);
        const atualizarCarousel = () => {
            if (slidesContainer.children.length === 0) return;
            const visiveis = getSlidesVisiveis();
            const maxIndex = Math.max(0, totalSlides - visiveis);
            slideAtual = Math.max(0, Math.min(slideAtual, maxIndex));
            const slideWidth = slidesContainer.children[0].offsetWidth;
            const gap = parseFloat(getComputedStyle(slidesContainer).gap) || 0;
            slidesContainer.style.transform = `translateX(-${slideAtual * (slideWidth + gap)}px)`;
            btnAnterior.disabled = slideAtual === 0;
            btnProximo.disabled = slideAtual >= maxIndex;
        };
        btnAnterior.onclick = () => {
            slideAtual--;
            atualizarCarousel();
        };
        btnProximo.onclick = () => {
            slideAtual++;
            atualizarCarousel();
        };
        window.onresize = atualizarCarousel;
        atualizarCarousel();
    }

    // =================================================================================
    // 7. FUNÇÕES UTILITÁRIAS
    // =================================================================================
    function formatDateToPtBr(dateInput) {
        if (!dateInput) return '';
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    }

    // =================================================================================
    // 8. LISTENERS DE EVENTOS E FUNÇÕES GLOBAIS
    // =================================================================================
    Object.assign(window, {
        toggleSidebar,
        openModal,
        closeModal,
        showSection,
        logout,
        enterEditMode,
        saveProfileChanges,
        cancelProfileEdit: () => exitEditMode(false),
        editMatch,
        deleteMatch,
        cadastrarEmPartida,
        cancelarInscricao,
        openMatchDetails
    });

    ui.profileImageInputEdit.addEventListener('change', handleProfileImageChange);

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    showSection('home');
});