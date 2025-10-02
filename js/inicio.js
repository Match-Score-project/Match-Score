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
        sidebarOverlay: document.getElementById('sidebar-overlay'),
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
        modalMatchTitle: document.getElementById('modalMatchTitle'),
        notificationDot: document.getElementById('notificationDot'),
        notificationsList: document.getElementById('notifications-list'),
        // Novos elementos para os filtros
        filterDate: document.getElementById('filter-date'),
        filterLocal: document.getElementById('filter-local'),
        filterType: document.getElementById('filter-type'),
        clearFiltersBtn: document.getElementById('clear-filters-btn')
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loadUserProfile();
            fetchAndDisplayMatches(); // Busca inicial
            fetchAndDisplayMyMatches();
            fetchAndDisplayRegisteredMatches();
            fetchAndDisplayNotifications();
        }
    });
    
    // =================================================================================
    // 2. LÓGICA DAS NOTIFICAÇÕES (sem alterações)
    // =================================================================================
    async function fetchAndDisplayNotifications() {
        if (!currentUser || !ui.notificationsList) return;

        try {
            const snapshot = await db.collection('notificacoes')
                .where('userId', '==', currentUser.uid)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();
            
            ui.notificationsList.innerHTML = '';
            let hasUnread = false;

            if (snapshot.empty) {
                ui.notificationsList.innerHTML = '<p style="text-align: center; color: var(--light-gray);">Nenhuma notificação encontrada.</p>';
                ui.notificationDot.classList.remove('visible');
                return;
            }

            snapshot.forEach(doc => {
                const notification = doc.data();
                if (!notification.isRead) {
                    hasUnread = true;
                }

                const date = notification.timestamp ? notification.timestamp.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                
                ui.notificationsList.innerHTML += `
                    <div class="notification-item ${!notification.isRead ? 'unread' : ''}" id="notif-${doc.id}">
                        <div class="notification-icon">💬</div>
                        <div class="notification-content">
                            <p>${notification.message}</p>
                            <span class="timestamp">${date}</span>
                        </div>
                        <div class="notification-actions">
                            <button class="btn-delete-notification" onclick="deleteNotification('${doc.id}')">&times;</button>
                        </div>
                    </div>
                `;
            });

            ui.notificationDot.classList.toggle('visible', hasUnread);

        } catch (error) {
            console.error("Erro ao buscar notificações:", error);
            ui.notificationsList.innerHTML = '<p>Erro ao carregar notificações. Verifique se o índice do Firestore foi criado.</p>';
        }
    }

    async function markNotificationsAsRead() {
        ui.notificationDot.classList.remove('visible');
        
        const unreadItems = ui.notificationsList.querySelectorAll('.notification-item.unread');
        if (unreadItems.length === 0) return;

        const batch = db.batch();
        unreadItems.forEach(item => {
            const notifId = item.id.replace('notif-', '');
            const notifRef = db.collection('notificacoes').doc(notifId);
            batch.update(notifRef, { isRead: true });
            item.classList.remove('unread');
        });

        try {
            await batch.commit();
        } catch (error) {
            console.error("Erro ao marcar notificações como lidas:", error);
        }
    }

    async function deleteNotification(notificationId) {
        try {
            await db.collection('notificacoes').doc(notificationId).delete();
            const elementToRemove = document.getElementById(`notif-${notificationId}`);
            if (elementToRemove) {
                elementToRemove.remove();
            }
            if (ui.notificationsList.children.length === 0) {
                ui.notificationsList.innerHTML = '<p style="text-align: center; color: var(--light-gray);">Nenhuma notificação encontrada.</p>';
            }
            showToast('Notificação excluída.', 'info');
        } catch (error) {
            console.error("Erro ao apagar notificação:", error);
            showToast('Erro ao excluir notificação.', 'error');
        }
    }
    
    // =================================================================================
    // 3. LÓGICA DAS PARTIDAS
    // =================================================================================
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
            const isCreator = currentUser && currentUser.uid === matchData.creatorId;
            let playersHTML = '';
            if (playersSnapshot.empty) {
                playersHTML = '<p>Nenhum jogador cadastrado ainda.</p>';
            } else {
                playersSnapshot.forEach(playerDoc => {
                    const playerData = playerDoc.data();
                    const playerId = playerDoc.id;
                    const removeButton = isCreator && playerId !== currentUser.uid ?
                        `<button class="btn-remove-player" onclick="removerJogador('${matchId}', '${playerId}', '${matchData.nome}')">×</button>` :
                        '';
                    playersHTML += `
                        <div class="player-item">
                            <img src="${playerData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="player-item-avatar">
                            <div class="player-item-info">
                                <span class="player-name">${playerData.nome}</span>
                                <span class="player-position">${playerData.posicao}</span>
                            </div>
                            ${removeButton}
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
    
    async function removerJogador(matchId, playerId, matchName) {
        openConfirmModal('Remover Jogador', 'Você tem certeza?', async () => {
            toggleLoading(true);
            try {
                await db.collection('partidas').doc(matchId).collection('jogadores').doc(playerId).delete();
                await db.collection('notificacoes').add({
                    userId: playerId,
                    message: `Você foi removido da partida "${matchName}" pelo organizador.`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    isRead: false
                });
                showToast('Jogador removido com sucesso!', 'success');
                openMatchDetails(matchId);
            } catch (error) {
                console.error("Erro ao remover jogador:", error);
                showToast('Não foi possível remover o jogador.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }
    
    async function fetchAndDisplayRegisteredMatches() {
        if (!currentUser || !ui.registeredMatchesGrid) return;
        ui.registeredMatchesGrid.innerHTML = '<p>Buscando jogos em que você se cadastrou...</p>';
        try {
            const playerRegistrations = await db.collectionGroup('jogadores').where('userId', '==', currentUser.uid).get();
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

    // =================== FUNÇÃO MODIFICADA PARA FILTROS ===================
    async function fetchAndDisplayMatches() {
        if (!ui.allMatchesGrid) return;
        ui.allMatchesGrid.innerHTML = '<p>Carregando partidas...</p>';
        // Limpa o carrossel apenas na busca inicial
        if (!ui.filterDate.value && !ui.filterLocal.value && !ui.filterType.value) {
             ui.carouselSlides.innerHTML = '';
        }

        // 1. Pega os valores dos filtros
        const filterDate = ui.filterDate.value;
        const filterLocal = ui.filterLocal.value.toLowerCase().trim();
        const filterType = ui.filterType.value;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        
        // A data de início é a data do filtro, ou hoje, o que for mais recente
        const startDate = filterDate && filterDate > todayString ? filterDate : todayString;

        try {
            // 2. Monta a query base no Firebase
            let query = db.collection('partidas').where('data', '>=', startDate);

            if (filterType) {
                query = query.where('tipo', '==', filterType);
            }

            query = query.orderBy('data', 'asc');
            
            const snapshot = await query.get();

            let allMatches = [];
            snapshot.forEach(doc => {
                allMatches.push({ id: doc.id, ...doc.data() });
            });

            // 3. Aplica o filtro de local no lado do cliente (JavaScript)
            let filteredMatches = allMatches;
            if (filterLocal) {
                filteredMatches = allMatches.filter(match => 
                    match.local.toLowerCase().includes(filterLocal)
                );
            }

            // 4. Exibe os resultados
            if (filteredMatches.length === 0) {
                ui.allMatchesGrid.innerHTML = '<p>Nenhuma partida encontrada com os filtros selecionados.</p>';
            } else {
                ui.allMatchesGrid.innerHTML = '';
                filteredMatches.forEach(match => {
                    ui.allMatchesGrid.innerHTML += createMatchCard(match, match.id);
                });
            }
            
            // Atualiza o carrossel apenas na busca inicial (sem filtros)
            if (!ui.filterDate.value && !ui.filterLocal.value && !ui.filterType.value) {
                const carouselMatches = filteredMatches.slice(0, 5);
                ui.carouselSlides.innerHTML = '';
                carouselMatches.forEach(match => {
                     ui.carouselSlides.innerHTML += createCarouselSlide(match, match.id);
                });
                setupCarousel();
            }

        } catch (error) {
            console.error("Erro ao buscar partidas:", error);
            ui.allMatchesGrid.innerHTML = '<p>Erro ao carregar as partidas. Verifique se o índice do Firestore foi criado.</p>';
        }
    }
    // ===================================================================

    async function fetchAndDisplayMyMatches() {
        if (!currentUser || !ui.myMatchesGrid) return;
        ui.myMatchesGrid.innerHTML = '<p>Carregando suas partidas...</p>';
        try {
            const snapshot = await db.collection('partidas').where('creatorId', '==', currentUser.uid).orderBy('criadoEm', 'desc').get();
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
    // 4. CONTROLE DA UI (SIDEBAR, MODAIS, SEÇÕES) - sem alterações
    // =================================================================================
    function closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            if (modal.id !== 'confirmModal') {
                modal.classList.remove('active');
            }
        });
        if (document.querySelectorAll('.modal.active').length === 0) {
            document.body.style.overflow = 'auto';
        }
    }

    function openModal(modalId) {
        if (modalId !== 'confirmModal') {
            closeAllModals(); 
        }
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            if (modalId === 'notificationsModal') {
                markNotificationsAsRead();
            }
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
        openModal('confirmModal');
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
    }

    function toggleSidebar(forceOpen) {
        const isOpen = ui.sidebar.classList.contains('open');
        const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;

        ui.sidebar.classList.toggle('open', shouldOpen);
        if (ui.sidebarOverlay) {
            ui.sidebarOverlay.classList.toggle('active', shouldOpen);
        }
    }

    function showSection(sectionId) {
        closeAllModals(); 
        document.querySelectorAll('.page-section').forEach(section => {
            section.style.display = 'none';
        });
        const content = document.getElementById(`${sectionId}-content`);
        if (content) content.style.display = 'block';
        if (window.innerWidth <= 768 && ui.sidebar.classList.contains('open')) {
            toggleSidebar(false);
        }
    }

    // =================================================================================
    // 5. LÓGICA DO PERFIL DO USUÁRIO (sem alterações)
    // =================================================================================
    async function loadUserProfile() {
        if (!currentUser) return;
        try {
            const doc = await db.collection('usuarios').doc(currentUser.uid).get();
            if (doc.exists) {
                const data = doc.data();
                ui.profilePicPreview.src = data.fotoURL || 'imagens/perfil.png';
                ui.profileInfoDiv.innerHTML = `<p><strong>Nome:</strong> ${data.nome || ''}</p><p><strong>Email:</strong> ${data.email || ''}</p><p><strong>Telefone:</strong> ${data.telefone || ''}</p><p><strong>Data Nasc:</strong> ${formatDateToPtBr(data.dataNascimento) || ''}</p><p><strong>Posição:</strong> ${data.posicao || ''}</p>`;
                const isDark = (data.theme !== 'light');
                applyTheme(isDark);
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
    // 6. LÓGICA DAS CONFIGURAÇÕES (sem alterações)
    // =================================================================================
    function applyTheme(isDark) {
        document.body.classList.toggle('light-mode', !isDark);
        ui.themeToggle.checked = isDark;
    }

    ui.themeToggle.addEventListener('change', () => {
        const isDark = ui.themeToggle.checked;
        applyTheme(isDark);
        if (currentUser) {
            db.collection('usuarios').doc(currentUser.uid).set({ theme: isDark ? 'dark' : 'light' }, { merge: true });
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
    // 7. LÓGICA DO CARROSSEL (sem alterações)
    // =================================================================================
    function setupCarousel() {
        const slidesContainer = ui.carouselSlides;
        if (!slidesContainer || slidesContainer.children.length === 0) return;
        const btnAnterior = document.getElementById("btn-anterior");
        const btnProximo = document.getElementById("btn-proximo");
        let slideAtual = 0;
        const atualizarCarousel = () => {
            if (slidesContainer.children.length === 0) return;
            const totalSlides = slidesContainer.children.length;
            const getSlidesVisiveis = () => {
                if (window.innerWidth <= 480) return 1;
                if (window.innerWidth <= 768) return 2;
                return 4;
            };
            const visiveis = getSlidesVisiveis();
            const maxIndex = Math.max(0, totalSlides - visiveis);
            slideAtual = Math.max(0, Math.min(slideAtual, maxIndex));
            const slideWidth = slidesContainer.children[0].offsetWidth;
            const gap = parseFloat(getComputedStyle(slidesContainer).gap) || 0;
            slidesContainer.style.transform = `translateX(-${slideAtual * (slideWidth + gap)}px)`;
            btnAnterior.disabled = slideAtual === 0;
            btnProximo.disabled = slideAtual >= maxIndex;
        };
        btnAnterior.onclick = () => { slideAtual--; atualizarCarousel(); };
        btnProximo.onclick = () => { slideAtual++; atualizarCarousel(); };
        window.onresize = atualizarCarousel;
        atualizarCarousel();
    }

    // =================================================================================
    // 8. FUNÇÕES UTILITÁRIAS (sem alterações)
    // =================================================================================
    function formatDateToPtBr(dateInput) {
        if (!dateInput) return '';
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    }

    // =================================================================================
    // 9. LISTENERS E FUNÇÕES GLOBAIS
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
        openMatchDetails,
        removerJogador,
        deleteNotification
    });

    // Adiciona os listeners para os filtros
    ui.filterDate.addEventListener('change', fetchAndDisplayMatches);
    ui.filterLocal.addEventListener('input', fetchAndDisplayMatches);
    ui.filterType.addEventListener('change', fetchAndDisplayMatches);
    ui.clearFiltersBtn.addEventListener('click', () => {
        ui.filterDate.value = '';
        ui.filterLocal.value = '';
        ui.filterType.value = '';
        fetchAndDisplayMatches();
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