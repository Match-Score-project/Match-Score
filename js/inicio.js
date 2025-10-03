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
    const rtdb = firebase.database(); // NOVO: Referência ao Realtime Database
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
        filterDate: document.getElementById('filter-date'),
        filterLocal: document.getElementById('filter-local'),
        filterType: document.getElementById('filter-type'),
        clearFiltersBtn: document.getElementById('clear-filters-btn'),
        friendsSearchBar: document.querySelector('#friends-content .search-bar'),
        friendsList: document.getElementById('friends-list'),
        friendsTabs: document.querySelectorAll('#friends-content .tab')
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            managePresence(user); // NOVO: Ativa o gerenciador de presença
            loadUserProfile();
            fetchAndDisplayMatches();
            fetchAndDisplayMyMatches();
            fetchAndDisplayRegisteredMatches();
            fetchAndDisplayNotifications();
        }
    });

    // =================================================================================
    // 2. LÓGICA DE PRESENÇA ONLINE (NOVO)
    // =================================================================================
    function managePresence(user) {
        const userStatusRef = rtdb.ref('/status/' + user.uid);

        const isOfflineForDatabase = {
            state: 'offline',
            last_changed: firebase.database.ServerValue.TIMESTAMP,
        };
        const isOnlineForDatabase = {
            state: 'online',
            last_changed: firebase.database.ServerValue.TIMESTAMP,
        };

        rtdb.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === false) {
                return;
            }
            
            userStatusRef.onDisconnect().set(isOfflineForDatabase).then(() => {
                userStatusRef.set(isOnlineForDatabase);
            });
        });
    }

    // =================================================================================
    // 3. LÓGICA DE AMIGOS
    // =================================================================================
    
    async function changeFriendsTab(tabName, element) {
        ui.friendsTabs.forEach(tab => tab.classList.remove('active'));
        element.classList.add('active');

        if (tabName === 'all') {
            ui.friendsSearchBar.style.display = 'block';
            await fetchFriends();
        } else if (tabName === 'online') {
            ui.friendsSearchBar.style.display = 'none';
            await fetchOnlineFriends(); // ATUALIZADO
        } else if (tabName === 'pending') {
            ui.friendsSearchBar.style.display = 'none';
            await fetchFriendRequests();
        }
    }

    async function fetchOnlineFriends() {
        if (!currentUser) return;
        ui.friendsList.innerHTML = '<li class="friend-item-empty">Verificando amigos online...</li>';

        try {
            const friendsSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('amigos')
                .where('status', '==', 'accepted').get();

            if (friendsSnapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Você não tem amigos para verificar o status.</li>';
                return;
            }

            const friendIds = friendsSnapshot.docs.map(doc => doc.id);
            const onlineFriendPromises = [];

            for (const friendId of friendIds) {
                const statusRef = rtdb.ref('/status/' + friendId);
                const promise = statusRef.get().then(snapshot => {
                    if (snapshot.exists() && snapshot.val().state === 'online') {
                        return friendId;
                    }
                    return null;
                });
                onlineFriendPromises.push(promise);
            }
            
            const onlineFriendIds = (await Promise.all(onlineFriendPromises)).filter(id => id !== null);

            if (onlineFriendIds.length === 0) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhum dos seus amigos está online.</li>';
                return;
            }

            ui.friendsList.innerHTML = '';
            for (const friendId of onlineFriendIds) {
                const userDoc = await db.collection('usuarios').doc(friendId).get();
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const friendHTML = `
                        <li class="friend-item">
                            <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                            <div class="friend-info">
                                <span class="friend-name">${userData.nome}</span>
                                <span class="friend-status online">Online agora</span>
                            </div>
                        </li>
                    `;
                    ui.friendsList.innerHTML += friendHTML;
                }
            }

        } catch (error) {
            console.error("Erro ao buscar amigos online:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao verificar os amigos online.</li>';
        }
    }

    async function fetchFriends() {
        if (!currentUser) return;
        ui.friendsList.innerHTML = '<li class="friend-item-empty">Carregando sua lista de amigos...</li>';
        
        try {
            const friendsSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('amigos')
                .where('status', '==', 'accepted')
                .get();
            
            if (friendsSnapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Você ainda não tem amigos. Use a busca para adicionar.</li>';
                return;
            }

            ui.friendsList.innerHTML = '';
            for (const doc of friendsSnapshot.docs) {
                const friendData = doc.data();
                const friendId = doc.id;
                
                const userDoc = await db.collection('usuarios').doc(friendId).get();
                const userData = userDoc.data();

                const friendHTML = `
                    <li class="friend-item" id="friend-${friendId}">
                        <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">${friendData.amigoNome}</span>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-danger" onclick="removeFriend('${friendId}', '${friendData.amigoNome}')">Remover</button>
                        </div>
                    </li>
                `;
                ui.friendsList.innerHTML += friendHTML;
            }
        } catch (error) {
            console.error("Erro ao buscar amigos:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar sua lista de amigos.</li>';
        }
    }

    function removeFriend(friendId, friendName) {
        openConfirmModal('Remover Amigo', `Você tem certeza que quer remover ${friendName} da sua lista de amigos?`, async () => {
            if (!currentUser) return;

            const batch = db.batch();

            const currentUserFriendRef = db.collection('usuarios').doc(currentUser.uid).collection('amigos').doc(friendId);
            batch.delete(currentUserFriendRef);
            
            const friendUserRef = db.collection('usuarios').doc(friendId).collection('amigos').doc(currentUser.uid);
            batch.delete(friendUserRef);
            
            try {
                await batch.commit();
                showToast(`${friendName} foi removido da sua lista de amigos.`, 'info');
                const friendElement = document.getElementById(`friend-${friendId}`);
                if (friendElement) friendElement.remove();

                if (ui.friendsList.children.length === 0) {
                     ui.friendsList.innerHTML = '<li class="friend-item-empty">Você ainda não tem amigos. Use a busca para adicionar.</li>';
                }
            } catch (error) {
                console.error("Erro ao remover amigo:", error);
                showToast("Ocorreu um erro ao remover o amigo.", "error");
            }
        });
    }

    async function fetchFriendRequests() {
        if (!currentUser) return;
        ui.friendsList.innerHTML = '<li class="friend-item-empty">Buscando solicitações...</li>';
        
        try {
            const requestsSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('amigos')
                .where('status', '==', 'pending_received')
                .orderBy('timestamp', 'desc')
                .get();
            
            if (requestsSnapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhuma solicitação de amizade pendente.</li>';
                return;
            }

            ui.friendsList.innerHTML = '';
            for (const doc of requestsSnapshot.docs) {
                const requestData = doc.data();
                const friendId = doc.id;
                
                const userDoc = await db.collection('usuarios').doc(friendId).get();
                const userData = userDoc.data();

                const requestHTML = `
                    <li class="friend-item" id="request-${friendId}">
                        <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">${requestData.amigoNome}</span>
                            <span class="friend-status">Enviou um pedido de amizade</span>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-success" onclick="acceptFriendRequest('${friendId}', '${requestData.amigoNome}')">Aceitar</button>
                            <button class="btn btn-danger" onclick="declineFriendRequest('${friendId}')">Recusar</button>
                        </div>
                    </li>
                `;
                ui.friendsList.innerHTML += requestHTML;
            }
        } catch (error) {
            console.error("Erro ao buscar solicitações:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar solicitações.</li>';
        }
    }

    async function acceptFriendRequest(friendId, friendName) {
        if (!currentUser) return;

        const currentUserId = currentUser.uid;
        const currentUserDoc = await db.collection('usuarios').doc(currentUserId).get();
        const currentUserName = currentUserDoc.data().nome;

        const batch = db.batch();

        const currentUserFriendRef = db.collection('usuarios').doc(currentUserId).collection('amigos').doc(friendId);
        batch.update(currentUserFriendRef, { status: 'accepted' });

        const friendUserRef = db.collection('usuarios').doc(friendId).collection('amigos').doc(currentUserId);
        batch.update(friendUserRef, { status: 'accepted' });
        
        const notificationRef = db.collection('notificacoes').doc();
        batch.set(notificationRef, {
            userId: friendId,
            message: `${currentUserName} aceitou seu pedido de amizade!`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            isRead: false
        });

        try {
            await batch.commit();
            showToast(`Você e ${friendName} agora são amigos!`, 'success');
            const requestElement = document.getElementById(`request-${friendId}`);
            if (requestElement) requestElement.remove();
            
            if (ui.friendsList.children.length === 0) {
                 ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhuma solicitação de amizade pendente.</li>';
            }

        } catch (error) {
            console.error("Erro ao aceitar pedido:", error);
            showToast("Ocorreu um erro ao aceitar o pedido.", "error");
        }
    }

    async function declineFriendRequest(friendId) {
        if (!currentUser) return;
        const currentUserId = currentUser.uid;

        const batch = db.batch();

        const currentUserFriendRef = db.collection('usuarios').doc(currentUserId).collection('amigos').doc(friendId);
        batch.delete(currentUserFriendRef);
        
        const friendUserRef = db.collection('usuarios').doc(friendId).collection('amigos').doc(currentUserId);
        batch.delete(friendUserRef);
        
        try {
            await batch.commit();
            showToast('Solicitação recusada.', 'info');
            const requestElement = document.getElementById(`request-${friendId}`);
            if (requestElement) requestElement.remove();

            if (ui.friendsList.children.length === 0) {
                 ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhuma solicitação de amizade pendente.</li>';
            }
        } catch (error) {
            console.error("Erro ao recusar pedido:", error);
            showToast("Ocorreu um erro ao recusar o pedido.", "error");
        }
    }

    async function handleFriendSearch(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        if (!currentUser || !ui.friendsSearchBar || !ui.friendsList) return;

        const searchTerm = ui.friendsSearchBar.value.trim().toLowerCase();
        
        if (searchTerm.length === 0) {
            fetchFriends();
            return;
        }

        ui.friendsList.innerHTML = '<li class="friend-item-empty">Buscando...</li>';

        if (searchTerm.length < 3) {
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Digite pelo menos 3 letras para buscar.</li>';
            return;
        }

        try {
            const searchQuery = db.collection('usuarios')
                .where('nome_lowercase', '>=', searchTerm)
                .where('nome_lowercase', '<=', searchTerm + '\uf8ff')
                .limit(10);
            
            const snapshot = await searchQuery.get();

            if (snapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhum usuário encontrado.</li>';
                return;
            }

            ui.friendsList.innerHTML = '';
            for (const doc of snapshot.docs) {
                if (doc.id === currentUser.uid) continue;

                const userData = doc.data();
                const userId = doc.id;

                const userHTML = `
                    <li class="friend-item">
                        <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">${userData.nome}</span>
                        </div>
                        <div class="friend-actions">
                            <button class="btn btn-primary" id="add-friend-${userId}" onclick="sendFriendRequest('${userId}', '${userData.nome}')">Adicionar</button>
                        </div>
                    </li>
                `;
                ui.friendsList.innerHTML += userHTML;
            }

        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar. Verifique se o índice foi criado no Firestore.</li>';
        }
    }
    
    async function sendFriendRequest(receiverId, receiverName) {
        if (!currentUser || !receiverId) return;

        const senderId = currentUser.uid;
        const senderDoc = await db.collection('usuarios').doc(senderId).get();
        const senderName = senderDoc.data().nome;

        const friendButton = document.getElementById(`add-friend-${receiverId}`);
        friendButton.disabled = true;
        friendButton.textContent = 'Enviando...';

        try {
            const batch = db.batch();

            const senderRef = db.collection('usuarios').doc(senderId).collection('amigos').doc(receiverId);
            batch.set(senderRef, { status: 'pending_sent', amigoNome: receiverName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });

            const receiverRef = db.collection('usuarios').doc(receiverId).collection('amigos').doc(senderId);
            batch.set(receiverRef, { status: 'pending_received', amigoNome: senderName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });

            const notificationRef = db.collection('notificacoes').doc();
            batch.set(notificationRef, {
                userId: receiverId,
                message: `${senderName} te enviou um pedido de amizade.`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isRead: false
            });

            await batch.commit();
            
            showToast(`Pedido de amizade enviado para ${receiverName}!`, 'success');
            friendButton.textContent = 'Enviado';

        } catch (error) {
            console.error("Erro ao enviar pedido de amizade:", error);
            showToast("Erro ao enviar pedido.", "error");
            friendButton.disabled = false;
            friendButton.textContent = 'Adicionar';
        }
    }
    
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

    async function fetchAndDisplayMatches() {
        if (!ui.allMatchesGrid) return;
        ui.allMatchesGrid.innerHTML = '<p>Carregando partidas...</p>';
        if (!ui.filterDate.value && !ui.filterLocal.value && !ui.filterType.value) {
             ui.carouselSlides.innerHTML = '';
        }

        const filterDate = ui.filterDate.value;
        const filterLocal = ui.filterLocal.value.toLowerCase().trim();
        const filterType = ui.filterType.value;

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        
        const startDate = filterDate && filterDate > todayString ? filterDate : todayString;

        try {
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

            let filteredMatches = allMatches;
            if (filterLocal) {
                filteredMatches = allMatches.filter(match => 
                    match.local.toLowerCase().includes(filterLocal)
                );
            }

            if (filteredMatches.length === 0) {
                ui.allMatchesGrid.innerHTML = '<p>Nenhuma partida encontrada com os filtros selecionados.</p>';
            } else {
                ui.allMatchesGrid.innerHTML = '';
                filteredMatches.forEach(match => {
                    ui.allMatchesGrid.innerHTML += createMatchCard(match, match.id);
                });
            }
            
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
                        <div>
                            <button class="btn btn-secondary" onclick="alterarInscricao('${matchId}')">Alterar</button>
                            <button class="btn btn-danger" onclick="cancelarInscricao('${matchId}')">Cancelar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function cadastrarEmPartida(matchId) {
        if (!matchId) return showToast('ID da partida não encontrado.', 'error');
        window.location.href = `cadastrojogador.html?matchId=${matchId}`;
    }
    
    function alterarInscricao(matchId) {
        if (!matchId) return showToast('ID da partida não encontrado.', 'error');
        window.location.href = `cadastrojogador.html?matchId=${matchId}&edit=true`;
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
        
        if(sectionId === 'friends') {
            changeFriendsTab('all', ui.friendsTabs[0]);
        }

        if (window.innerWidth <= 768 && ui.sidebar.classList.contains('open')) {
            toggleSidebar(false);
        }
    }

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

        const newName = document.getElementById('editNome').value.trim();

        const dataToUpdate = {
            nome: newName,
            nome_lowercase: newName.toLowerCase(),
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

    function formatDateToPtBr(dateInput) {
        if (!dateInput) return '';
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    }

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
        alterarInscricao,
        openMatchDetails,
        removerJogador,
        deleteNotification,
        changeFriendsTab, 
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        removeFriend
    });
    
    if (ui.friendsSearchBar) {
        ui.friendsSearchBar.addEventListener('keydown', handleFriendSearch);
    }

    if (ui.sidebarOverlay) {
        ui.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }
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