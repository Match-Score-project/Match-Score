'use strict';

/**
 * @fileoverview Script principal da aplicação (inicio.html).
 * Gerencia a exibição de partidas, perfil do usuário, configurações,
 * amigos, notificações e todas as interações principais da dashboard.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Exibe um toast de sucesso se o usuário acabou de se inscrever em uma partida.
    // A informação é passada da página 'cadastrojogador.html' através da sessionStorage.
    if (sessionStorage.getItem('registrationSuccess') === 'true') {
        const matchName = sessionStorage.getItem('matchName');
        if (matchName) {
            showToast(`Inscrição na partida "${matchName}" realizada com sucesso!`, 'success');
        }
        // Limpa os dados da sessão para não mostrar o aviso novamente em um futuro refresh.
        sessionStorage.removeItem('registrationSuccess');
        sessionStorage.removeItem('matchName');
    }

    // =================================================================================
    // 1. INICIALIZAÇÃO E VARIÁVEIS GLOBAIS
    // =================================================================================
    if (typeof firebase === 'undefined' || typeof showToast === 'undefined') {
        return console.error("Firebase ou utils.js não carregados.");
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const rtdb = firebase.database(); // Realtime Database para o status de presença (online/offline)
    
    let currentUser = null;
    let currentOpenMatchId = null; // Armazena o ID da partida atualmente aberta no modal de detalhes
    let registeredMatchIds = new Set(); // Conjunto para armazenar IDs das partidas em que o usuário está inscrito. Usar Set é mais eficiente para buscas.

    // Mapeamento centralizado de todos os elementos da UI para fácil acesso e manutenção.
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
        friendsTabs: document.querySelectorAll('#friends-content .tab'),
        inviteFriendsList: document.getElementById('invite-friends-list')
    };

    /**
     * Observador de autenticação. É o ponto de partida de toda a lógica da página.
     * Executa as funções principais assim que o estado do usuário (logado/deslogado) é confirmado.
     */
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            managePresence(user); // Ativa o status "online"
            loadUserProfile();
            
            // É importante carregar as inscrições do usuário primeiro para que os botões "Inscrever-se"/"Inscrito" sejam exibidos corretamente.
            await fetchUserRegistrations(); 

            // Carrega as diferentes seções da página.
            fetchAndDisplayMatches();
            fetchAndDisplayMyMatches();
            fetchAndDisplayRegisteredMatches();
            fetchAndDisplayNotifications();
        }
    });

    // =================================================================================
    // 2. FUNÇÕES DE DADOS (Inscrições, Presença, etc.)
    // =================================================================================
    
    /**
     * Busca no Firestore todas as partidas em que o usuário está inscrito (usando collectionGroup)
     * e armazena os IDs no conjunto 'registeredMatchIds' para consulta rápida.
     */
    async function fetchUserRegistrations() {
        if (!currentUser) return;
        try {
            // collectionGroup('jogadores') busca em todas as subcoleções 'jogadores' de todas as 'partidas'.
            const registrationsSnapshot = await db.collectionGroup('jogadores').where('userId', '==', currentUser.uid).get();
            const ids = registrationsSnapshot.docs.map(doc => doc.ref.parent.parent.id); // Pega o ID da partida (documento pai do pai)
            registeredMatchIds = new Set(ids);
        } catch (error) {
            console.error("Erro ao buscar inscrições do usuário:", error);
        }
    }

    /**
     * Gerencia o status de presença (online/offline) do usuário usando o Realtime Database.
     * @param {firebase.User} user - O objeto do usuário autenticado.
     */
    function managePresence(user) {
        const userStatusRef = rtdb.ref('/status/' + user.uid);
        const isOfflineForDatabase = { state: 'offline', last_changed: firebase.database.ServerValue.TIMESTAMP };
        const isOnlineForDatabase = { state: 'online', last_changed: firebase.database.ServerValue.TIMESTAMP };

        rtdb.ref('.info/connected').on('value', (snapshot) => {
            if (snapshot.val() === false) return; // Se o cliente não estiver conectado à internet, não faz nada.
            
            // onDisconnect() define uma ação a ser executada quando o cliente se desconectar.
            // Aqui, definimos que o status deve ser 'offline'.
            userStatusRef.onDisconnect().set(isOfflineForDatabase).then(() => {
                // Se a ação onDisconnect for definida com sucesso, definimos o status atual como 'online'.
                userStatusRef.set(isOnlineForDatabase);
            });
        });
    }

    // =================================================================================
    // 3. LÓGICA DE AMIGOS E SOCIAL
    // =================================================================================
    
    /**
     * Altera a aba visível na seção de amigos (Todos, Online, Solicitações).
     * @param {string} tabName - O nome da aba a ser exibida.
     * @param {HTMLElement} element - O elemento da aba que foi clicado.
     */
    async function changeFriendsTab(tabName, element) {
        ui.friendsTabs.forEach(tab => tab.classList.remove('active'));
        element.classList.add('active');

        if (tabName === 'all') {
            ui.friendsSearchBar.style.display = 'block';
            await fetchFriends();
        } else if (tabName === 'online') {
            ui.friendsSearchBar.style.display = 'none';
            await fetchOnlineFriends();
        } else if (tabName === 'pending') {
            ui.friendsSearchBar.style.display = 'none';
            await fetchFriendRequests();
        }
    }
    
    /**
     * Busca e exibe os amigos do usuário que estão atualmente online.
     */
    async function fetchOnlineFriends() {
        if (!currentUser) return;
        ui.friendsList.innerHTML = '<li class="friend-item-empty">Verificando amigos online...</li>';

        try {
            // Busca os amigos aceitos no Firestore
            const friendsSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('amigos').where('status', '==', 'accepted').get();

            if (friendsSnapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Você não tem amigos para verificar o status.</li>';
                return;
            }

            const friendIds = friendsSnapshot.docs.map(doc => doc.id);
            const onlineFriendPromises = [];

            // Para cada amigo, verifica seu status no Realtime Database
            for (const friendId of friendIds) {
                const statusRef = rtdb.ref('/status/' + friendId);
                const promise = statusRef.get().then(snapshot => {
                    if (snapshot.exists() && snapshot.val().state === 'online') {
                        return friendId; // Retorna o ID se estiver online
                    }
                    return null;
                });
                onlineFriendPromises.push(promise);
            }
            
            // Filtra apenas os IDs dos amigos que estão online
            const onlineFriendIds = (await Promise.all(onlineFriendPromises)).filter(id => id !== null);

            if (onlineFriendIds.length === 0) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhum dos seus amigos está online.</li>';
                return;
            }
            
            // Busca os dados completos dos amigos online para exibir na lista
            const onlineFriendsHtmlPromises = onlineFriendIds.map(async (friendId) => {
                const userDoc = await db.collection('usuarios').doc(friendId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    return `
                        <li class="friend-item">
                            <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                            <div class="friend-info">
                                <span class="friend-name">${userData.nome}</span>
                                <span class="friend-status online">Online agora</span>
                            </div>
                        </li>
                    `;
                }
                return '';
            });

            const onlineFriendsHtml = (await Promise.all(onlineFriendsHtmlPromises)).join('');
            ui.friendsList.innerHTML = onlineFriendsHtml;

        } catch (error) {
            console.error("Erro ao buscar amigos online:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao verificar os amigos online.</li>';
        }
    }

    /**
     * Busca e exibe a lista completa de amigos do usuário.
     */
    async function fetchFriends() {
        if (!currentUser) return;
        ui.friendsList.innerHTML = '<li class="friend-item-empty">Carregando sua lista de amigos...</li>';
        
        try {
            const friendsSnapshot = await db.collection('usuarios').doc(currentUser.uid).collection('amigos').where('status', '==', 'accepted').get();
            
            if (friendsSnapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Você ainda não tem amigos. Use a busca para adicionar.</li>';
                return;
            }

            // Mapeia os amigos e gera o HTML para cada um
            const friendsHtmlArray = [];
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
                friendsHtmlArray.push(friendHTML);
            }
            ui.friendsList.innerHTML = friendsHtmlArray.join('');

        } catch (error)
        {
            console.error("Erro ao buscar amigos:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar sua lista de amigos.</li>';
        }
    }

    /**
     * Remove um amigo da lista de amizades (operação em batch para garantir consistência).
     * @param {string} friendId - O UID do amigo a ser removido.
     * @param {string} friendName - O nome do amigo.
     */
    function removeFriend(friendId, friendName) {
        openConfirmModal('Remover Amigo', `Você tem certeza que quer remover ${friendName} da sua lista de amigos?`, async () => {
            if (!currentUser) return;

            const batch = db.batch(); // Inicia um batch de escrita

            // Deleta o registro de amizade do usuário atual
            const currentUserFriendRef = db.collection('usuarios').doc(currentUser.uid).collection('amigos').doc(friendId);
            batch.delete(currentUserFriendRef);
            
            // Deleta o registro de amizade do outro usuário
            const friendUserRef = db.collection('usuarios').doc(friendId).collection('amigos').doc(currentUser.uid);
            batch.delete(friendUserRef);
            
            // Pega o nome do usuário atual para a notificação
            const currentUserDoc = await db.collection('usuarios').doc(currentUser.uid).get();
            const currentUserName = currentUserDoc.data().nome;

            // Cria uma notificação para o amigo que foi removido
            const notificationRef = db.collection('notificacoes').doc();
            batch.set(notificationRef, {
                userId: friendId,
                message: `${currentUserName} desfez a amizade com você.`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isRead: false
            });
            
            try {
                await batch.commit(); // Executa todas as operações do batch atomicamente
                showToast(`${friendName} foi removido da sua lista de amigos.`, 'info');
                const friendElement = document.getElementById(`friend-${friendId}`);
                if (friendElement) friendElement.remove(); // Remove o elemento da UI

                if (ui.friendsList.children.length === 0) {
                     ui.friendsList.innerHTML = '<li class="friend-item-empty">Você ainda não tem amigos. Use a busca para adicionar.</li>';
                }
            } catch (error) {
                console.error("Erro ao remover amigo:", error);
                showToast("Ocorreu um erro ao remover o amigo.", "error");
            }
        });
    }

    /**
     * Busca e exibe as solicitações de amizade pendentes.
     */
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

            const requestsHtmlArray = [];
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
                requestsHtmlArray.push(requestHTML);
            }
            ui.friendsList.innerHTML = requestsHtmlArray.join('');

        } catch (error) {
            console.error("Erro ao buscar solicitações:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar solicitações.</li>';
        }
    }

    /**
     * Aceita uma solicitação de amizade.
     * @param {string} friendId - O UID do usuário que enviou a solicitação.
     * @param {string} friendName - O nome do usuário.
     */
    async function acceptFriendRequest(friendId, friendName) {
        if (!currentUser) return;

        const currentUserId = currentUser.uid;
        const currentUserDoc = await db.collection('usuarios').doc(currentUserId).get();
        const currentUserName = currentUserDoc.data().nome;

        const batch = db.batch();

        // Atualiza o status para 'accepted' para o usuário atual
        const currentUserFriendRef = db.collection('usuarios').doc(currentUserId).collection('amigos').doc(friendId);
        batch.update(currentUserFriendRef, { status: 'accepted' });

        // Atualiza o status para 'accepted' para o outro usuário
        const friendUserRef = db.collection('usuarios').doc(friendId).collection('amigos').doc(currentUserId);
        batch.update(friendUserRef, { status: 'accepted' });
        
        // Envia uma notificação para o outro usuário informando que a solicitação foi aceita
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

    /**
     * Recusa uma solicitação de amizade.
     * @param {string} friendId - O UID do usuário que enviou a solicitação.
     */
    async function declineFriendRequest(friendId) {
        if (!currentUser) return;
        const currentUserId = currentUser.uid;

        const batch = db.batch();

        // Deleta o registro da solicitação para ambos os usuários
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

    /**
     * Lida com a busca de usuários para adicionar como amigos.
     * @param {KeyboardEvent} event - O evento de teclado.
     */
    async function handleFriendSearch(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        if (!currentUser || !ui.friendsSearchBar || !ui.friendsList) return;

        const searchTerm = ui.friendsSearchBar.value.trim().toLowerCase();
        
        if (searchTerm.length === 0) {
            fetchFriends(); // Se a busca estiver vazia, mostra a lista de amigos novamente
            return;
        }

        ui.friendsList.innerHTML = '<li class="friend-item-empty">Buscando...</li>';

        if (searchTerm.length < 3) {
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Digite pelo menos 3 letras para buscar.</li>';
            return;
        }

        try {
            // Busca por usuários cujo nome (em minúsculas) comece com o termo de busca
            const searchQuery = db.collection('usuarios')
                .where('nome_lowercase', '>=', searchTerm)
                .where('nome_lowercase', '<=', searchTerm + '\uf8ff')
                .limit(10);
            
            const snapshot = await searchQuery.get();

            if (snapshot.empty) {
                ui.friendsList.innerHTML = '<li class="friend-item-empty">Nenhum usuário encontrado.</li>';
                return;
            }
            
            const usersHtml = snapshot.docs.map(doc => {
                if (doc.id === currentUser.uid) return ''; // Não exibe o próprio usuário na busca

                const userData = doc.data();
                const userId = doc.id;

                return `
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
            }).join('');
            ui.friendsList.innerHTML = usersHtml;

        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
            ui.friendsList.innerHTML = '<li class="friend-item-empty">Ocorreu um erro ao buscar. Verifique se o índice foi criado no Firestore.</li>';
        }
    }
    
    /**
     * Envia uma solicitação de amizade para outro usuário.
     * @param {string} receiverId - O UID do usuário que receberá a solicitação.
     * @param {string} receiverName - O nome do usuário.
     */
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

            // Cria o registro para o remetente com status 'pending_sent'
            const senderRef = db.collection('usuarios').doc(senderId).collection('amigos').doc(receiverId);
            batch.set(senderRef, { status: 'pending_sent', amigoNome: receiverName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });

            // Cria o registro para o destinatário com status 'pending_received'
            const receiverRef = db.collection('usuarios').doc(receiverId).collection('amigos').doc(senderId);
            batch.set(receiverRef, { status: 'pending_received', amigoNome: senderName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });

            // Envia uma notificação para o destinatário
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
    
    // =================================================================================
    // 4. LÓGICA DE CONVITE PARA PARTIDAS
    // =================================================================================

    /**
     * Exibe um modal com a lista de amigos para convidá-los para uma partida específica.
     * @param {string} matchId - O ID da partida para a qual convidar.
     */
    async function showInviteFriendsModal(matchId) {
        if (!matchId) return;
        currentOpenMatchId = matchId;
        openModal('inviteFriendsModal');
        ui.inviteFriendsList.innerHTML = '<li class="friend-item-empty">Carregando amigos...</li>';

        try {
            // Busca a lista de amigos e a lista de jogadores da partida em paralelo
            const friendsPromise = db.collection('usuarios').doc(currentUser.uid).collection('amigos').where('status', '==', 'accepted').get();
            const playersPromise = db.collection('partidas').doc(matchId).collection('jogadores').get();
            const [friendsSnapshot, playersSnapshot] = await Promise.all([friendsPromise, playersPromise]);

            if (friendsSnapshot.empty) {
                ui.inviteFriendsList.innerHTML = '<li class="friend-item-empty">Você não tem amigos para convidar.</li>';
                return;
            }

            // Cria um conjunto com os IDs dos jogadores que já estão na partida
            const playerIds = new Set(playersSnapshot.docs.map(doc => doc.id));
            
            const friendsHtmlArray = [];
            for (const doc of friendsSnapshot.docs) {
                const friendId = doc.id;
                const friendData = doc.data();
                const userDoc = await db.collection('usuarios').doc(friendId).get();
                const userData = userDoc.data();

                let buttonHTML;
                // Se o amigo já está na partida, o botão de convite fica desabilitado
                if (playerIds.has(friendId)) {
                    buttonHTML = `<button class="btn btn-secondary" disabled>Na Partida</button>`;
                } else {
                    buttonHTML = `<button class="btn btn-primary" id="invite-btn-${friendId}" onclick="sendMatchInvite('${friendId}', '${userData.nome}')">Convidar</button>`;
                }

                const friendHTML = `
                    <li class="friend-item">
                        <img src="${userData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">${friendData.amigoNome}</span>
                        </div>
                        <div class="friend-actions">
                            ${buttonHTML}
                        </div>
                    </li>
                `;
                friendsHtmlArray.push(friendHTML);
            }
            ui.inviteFriendsList.innerHTML = friendsHtmlArray.join('');

        } catch (error) {
            console.error("Erro ao carregar lista de amigos para convite:", error);
            ui.inviteFriendsList.innerHTML = '<li class="friend-item-empty">Erro ao carregar amigos.</li>';
        }
    }

    /**
     * Envia uma notificação de convite de partida para um amigo.
     * @param {string} friendId - O UID do amigo a ser convidado.
     * @param {string} friendName - O nome do amigo.
     */
    async function sendMatchInvite(friendId, friendName) {
        if (!currentUser || !friendId || !currentOpenMatchId) return;

        const inviteButton = document.getElementById(`invite-btn-${friendId}`);
        inviteButton.disabled = true;
        inviteButton.textContent = 'Enviando...';

        try {
            // Busca os nomes do remetente e da partida para incluir na notificação
            const senderDoc = await db.collection('usuarios').doc(currentUser.uid).get();
            const senderName = senderDoc.data().nome;

            const matchDoc = await db.collection('partidas').doc(currentOpenMatchId).get();
            const matchName = matchDoc.data().nome;

            // Cria a notificação
            await db.collection('notificacoes').add({
                userId: friendId,
                message: `${senderName} te convidou para a partida "${matchName}"!`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                isRead: false,
                type: 'match_invite', // Tipo especial para adicionar o botão "Inscrever-se"
                matchId: currentOpenMatchId
            });

            showToast(`Convite enviado para ${friendName}!`, 'success');
            inviteButton.textContent = 'Convidado';

        } catch (error) {
            console.error("Erro ao enviar convite:", error);
            showToast("Erro ao enviar convite.", "error");
            inviteButton.disabled = false;
            inviteButton.textContent = 'Convidar';
        }
    }
    
    // =================================================================================
    // 5. LÓGICA DE NOTIFICAÇÕES
    // =================================================================================
    
    /**
     * Busca e exibe as notificações mais recentes do usuário.
     */
    async function fetchAndDisplayNotifications() {
        if (!currentUser || !ui.notificationsList) return;
        try {
            const snapshot = await db.collection('notificacoes')
                .where('userId', '==', currentUser.uid)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();
            
            let hasUnread = false;

            if (snapshot.empty) {
                ui.notificationsList.innerHTML = '<p style="text-align: center; color: var(--light-gray);">Nenhuma notificação no momento.</p>';
                ui.notificationDot.classList.remove('visible');
                return;
            }
            
            const notificationsHtml = snapshot.docs.map(doc => {
                const notification = doc.data();
                if (!notification.isRead) {
                    hasUnread = true; // Se encontrar qualquer notificação não lida, ativa o ponto vermelho
                }

                const date = notification.timestamp ? notification.timestamp.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                
                // Adiciona o botão "Inscrever-se" se a notificação for um convite de partida
                let actionButtonHTML = '';
                if (notification.type === 'match_invite' && notification.matchId) {
                    actionButtonHTML = `<button class="btn-notification-action" onclick="goToMatchRegistration('${notification.matchId}', event)">Inscrever-se</button>`;
                }
                
                return `
                    <div class="notification-item ${!notification.isRead ? 'unread' : ''}" id="notif-${doc.id}">
                        <div class="notification-icon">💬</div>
                        <div class="notification-content">
                            <p>${notification.message}</p>
                            <span class="timestamp">${date}</span>
                            ${actionButtonHTML}
                        </div>
                        <div class="notification-actions">
                            <button class="btn-delete-notification" onclick="deleteNotification('${doc.id}'); event.stopPropagation();">&times;</button>
                        </div>
                    </div>
                `;
            }).join('');
            
            ui.notificationsList.innerHTML = notificationsHtml;
            ui.notificationDot.classList.toggle('visible', hasUnread); // Mostra ou esconde o ponto vermelho

        } catch (error) {
            console.error("Erro ao buscar notificações:", error);
            ui.notificationsList.innerHTML = '<p>Erro ao carregar notificações.</p>';
        }
    }

    /**
     * Redireciona para a página de inscrição de partida a partir de uma notificação.
     * @param {string} matchId - O ID da partida.
     * @param {Event} event - O evento de clique, para evitar que o modal feche.
     */
    function goToMatchRegistration(matchId, event) {
        event.stopPropagation(); 
        if (!matchId) return showToast('ID da partida não encontrado.', 'error');
        
        closeModal('notificationsModal'); 
        
        window.location.href = `cadastrojogador.html?matchId=${matchId}`;
    }

    /**
     * Marca todas as notificações visíveis e não lidas como lidas no Firestore.
     */
    async function markNotificationsAsRead() {
        ui.notificationDot.classList.remove('visible');
        
        const unreadItems = ui.notificationsList.querySelectorAll('.notification-item.unread');
        if (unreadItems.length === 0) return;

        const batch = db.batch();
        unreadItems.forEach(item => {
            const notifId = item.id.replace('notif-', '');
            const notifRef = db.collection('notificacoes').doc(notifId);
            batch.update(notifRef, { isRead: true });
            item.classList.remove('unread'); // Remove o estilo de não lido da UI imediatamente
        });

        try {
            await batch.commit();
        } catch (error) {
            console.error("Erro ao marcar notificações como lidas:", error);
        }
    }

    /**
     * Deleta uma notificação específica.
     * @param {string} notificationId - O ID da notificação a ser deletada.
     */
    async function deleteNotification(notificationId) {
        try {
            await db.collection('notificacoes').doc(notificationId).delete();
            const elementToRemove = document.getElementById(`notif-${notificationId}`);
            if (elementToRemove) {
                elementToRemove.remove();
            }
            if (ui.notificationsList.children.length === 0) {
                ui.notificationsList.innerHTML = '<p style="text-align: center; color: var(--light-gray);">Nenhuma notificação no momento.</p>';
            }
            showToast('Notificação excluída.', 'info');
        } catch (error) {
            console.error("Erro ao apagar notificação:", error);
            showToast('Erro ao excluir notificação.', 'error');
        }
    }
    
    // =================================================================================
    // 6. LÓGICA DE EXIBIÇÃO E GERENCIAMENTO DE PARTIDAS
    // =================================================================================

    /**
     * Copia o link de inscrição de uma partida para a área de transferência.
     * @param {string} matchId - O ID da partida.
     * @param {string} matchName - O nome da partida.
     */
    function shareMatch(matchId, matchName) {
        const url = `${window.location.origin}${window.location.pathname.replace('inicio.html', '')}cadastrojogador.html?matchId=${matchId}`;
        navigator.clipboard.writeText(url).then(() => {
            showToast(`Link para a partida "${matchName}" copiado!`, 'success');
        }).catch(err => {
            console.error('Erro ao copiar o link: ', err);
            showToast('Não foi possível copiar o link.', 'error');
        });
    }

    /**
     * Abre um modal com os detalhes completos de uma partida, incluindo a lista de jogadores.
     * @param {string} matchId - O ID da partida.
     */
    async function openMatchDetails(matchId) {
        if (!matchId) return;
        currentOpenMatchId = matchId;
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
                playersHTML = playersSnapshot.docs.map(playerDoc => {
                    const playerData = playerDoc.data();
                    const playerId = playerDoc.id;
                    // O botão de remover só aparece para o criador da partida e não para o próprio criador
                    const removeButton = isCreator && playerId !== currentUser.uid ?
                        `<button class="btn-remove-player" onclick="removerJogador('${matchId}', '${playerId}', '${matchData.nome}')">×</button>` :
                        '';
                    return `
                    <div class="player-item">
                        <img src="${playerData.fotoURL || 'imagens/perfil.png'}" alt="Avatar" class="player-item-avatar">
                        <div class="player-item-info">
                            <span class="player-name">${playerData.nome}</span>
                            <span class="player-position">${playerData.posicao}</span>
                        </div>
                        ${removeButton}
                    </div>
                `;
                }).join('');
            }

            const maxPlayers = matchData.vagasTotais || 'N/A';

            ui.matchDetailsContent.innerHTML = `
            <div class="modal-match-info">
                <p><strong>Data:</strong> ${formatDateToPtBr(matchData.data)} às ${matchData.hora}</p>
                <p><strong>Local:</strong> ${matchData.local}</p>
                <p><strong>Tipo:</strong> ${matchData.tipo}</p>
                <p><strong>Criador:</strong> ${matchData.creatorName || 'Não informado'}</p>
            </div>
            <div class="player-list-container">
                <h4>Jogadores Confirmados (${playersSnapshot.size} de ${maxPlayers})</h4>
                <div class="player-list">
                    ${playersHTML}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="shareMatch('${matchId}', '${matchData.nome}')">Compartilhar</button>
                <button class="btn btn-primary" onclick="showInviteFriendsModal('${matchId}')">Convidar Amigos</button>
            </div>
        `;
        } catch (error) {
            console.error("Erro ao buscar detalhes da partida:", error);
            ui.matchDetailsContent.innerHTML = '<p>Ocorreu um erro ao carregar os detalhes.</p>';
            showToast('Erro ao carregar detalhes.', 'error');
        }
    }

    
    /**
     * Remove um jogador de uma partida (função para o criador da partida).
     * @param {string} matchId - O ID da partida.
     * @param {string} playerId - O UID do jogador a ser removido.
     * @param {string} matchName - O nome da partida (para a notificação).
     */
    async function removerJogador(matchId, playerId, matchName) {
        openConfirmModal('Remover Jogador', 'Você tem certeza?', async () => {
            toggleLoading(true);
            try {
                // Deleta o documento do jogador da subcoleção
                await db.collection('partidas').doc(matchId).collection('jogadores').doc(playerId).delete();
                // Envia uma notificação para o jogador que foi removido
                await db.collection('notificacoes').add({
                    userId: playerId,
                    message: `Você foi removido da partida "${matchName}" pelo organizador.`,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    isRead: false
                });
                showToast('Jogador removido com sucesso!', 'success');
                openMatchDetails(matchId); // Reabre o modal para atualizar a lista
            } catch (error) {
                console.error("Erro ao remover jogador:", error);
                showToast('Não foi possível remover o jogador.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }
    
    /**
     * Busca verifica se não esta expirada e exibe as partidas nas quais o usuário está inscrito.
     */
      async function fetchAndDisplayRegisteredMatches() {
        if (!currentUser || !ui.registeredMatchesGrid) return;
        ui.registeredMatchesGrid.innerHTML = '<p>Buscando jogos em que você se cadastrou...</p>';
        try {
            // Pega a data de hoje para fazer a comparação
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normaliza para o início do dia para uma comparação justa
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayString = `${year}-${month}-${day}`;

            const playerRegistrations = await db.collectionGroup('jogadores').where('userId', '==', currentUser.uid).get();
            
            const registeredMatchesHtmlArray = [];
            for (const registrationDoc of playerRegistrations.docs) {
                const matchRef = registrationDoc.ref.parent.parent;
                const matchDoc = await matchRef.get();
                if (matchDoc.exists) {
                    const matchData = matchDoc.data();
                    const matchId = matchDoc.id;

                    // Se a data da partida for anterior a hoje, pula para a próxima iteração do loop.
                    if (matchData.data < todayString) {
                        continue; 
                    }

                    registeredMatchesHtmlArray.push(createRegisteredMatchCard(matchData, matchId));
                }
            }

            if (registeredMatchesHtmlArray.length === 0) {
                 ui.registeredMatchesGrid.innerHTML = '<p>Você não está cadastrado em nenhuma partida futura.</p>';
                 return;
            }

            ui.registeredMatchesGrid.innerHTML = registeredMatchesHtmlArray.join('');

        } catch (error) {
            console.error("Erro ao buscar jogos cadastrados:", error);
            ui.registeredMatchesGrid.innerHTML = '<p>Ocorreu um erro ao buscar seus jogos.</p>';
            showToast('Erro ao buscar seus jogos.', 'error');
        }
    }
    /**
     * Busca e exibe todas as partidas disponíveis, aplicando os filtros selecionados.
     */
    async function fetchAndDisplayMatches() {
        if (!ui.allMatchesGrid) return;
        ui.allMatchesGrid.innerHTML = '<p>Carregando partidas...</p>';
        // Limpa o carrossel apenas se não houver filtros ativos
        if (!ui.filterDate.value && !ui.filterLocal.value && !ui.filterType.value) {
             ui.carouselSlides.innerHTML = '';
        }

        const filterDate = ui.filterDate.value;
        const filterLocal = ui.filterLocal.value.toLowerCase().trim();
        const filterType = ui.filterType.value;

        // Pega a data de hoje para garantir que apenas partidas futuras sejam mostradas
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        
        const startDate = filterDate && filterDate > todayString ? filterDate : todayString;

        try {
            // Constrói a query do Firestore
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

            // O filtro de local é feito no lado do cliente pois o Firestore tem limitações com query de texto parcial ('contains')
            let filteredMatches = allMatches;
            if (filterLocal) {
                filteredMatches = allMatches.filter(match => 
                    match.local.toLowerCase().includes(filterLocal)
                );
            }

            // Exibe as partidas filtradas
            if (filteredMatches.length === 0) {
                ui.allMatchesGrid.innerHTML = '<p>Nenhuma partida encontrada com os filtros selecionados.</p>';
            } else {
                const matchesHTML = filteredMatches.map(match => createMatchCard(match, match.id)).join('');
                ui.allMatchesGrid.innerHTML = matchesHTML;
            }
            
            // Popula o carrossel apenas se não houver filtros ativos
            if (!ui.filterDate.value && !ui.filterLocal.value && !ui.filterType.value) {
                const carouselMatches = filteredMatches.slice(0, 5); // Pega as 5 primeiras partidas
                const carouselHTML = carouselMatches.map(match => createCarouselSlide(match, match.id)).join('');
                ui.carouselSlides.innerHTML = carouselHTML;
                setupCarousel();
            }

        } catch (error) {
            console.error("Erro ao buscar partidas:", error);
            ui.allMatchesGrid.innerHTML = '<p>Erro ao carregar as partidas. Verifique se o índice do Firestore foi criado.</p>';
        }
    }

    /**
     * Busca e exibe as partidas criadas pelo próprio usuário.
     */
    async function fetchAndDisplayMyMatches() {
        if (!currentUser || !ui.myMatchesGrid) return;
        ui.myMatchesGrid.innerHTML = '<p>Carregando suas partidas...</p>';

        // --- INÍCIO DA CORREÇÃO ---
        // Obtém a data de hoje de forma segura, sem converter para UTC.
        // Isso garante que a data seja sempre a local do usuário.
        const todayDate = new Date();
        const year = todayDate.getFullYear();
        const month = String(todayDate.getMonth() + 1).padStart(2, '0'); // getMonth() é 0-indexed
        const day = String(todayDate.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;
        // --- FIM DA CORREÇÃO ---

        try {
            // A query agora usará a string de data local correta.
            const snapshot = await db.collection('partidas').where('creatorId', '==', currentUser.uid).where('data', '>=', todayString).orderBy('data', 'asc').get();
            if (snapshot.empty) {
                ui.myMatchesGrid.innerHTML = '<p>Você não tem nenhuma partida futura criada.</p>';
                return;
            }

            const myMatchesHtml = snapshot.docs.map(doc => {
                const match = doc.data();
                const docId = doc.id;
                return createMyMatchCard(match, docId);
            }).join('');
            ui.myMatchesGrid.innerHTML = myMatchesHtml;

        } catch (error) {
            console.error("Erro ao buscar 'Minhas Partidas':", error);
            ui.myMatchesGrid.innerHTML = '<p>Erro ao carregar suas partidas.</p>';
        }
    }

    /**
     * Gera o HTML para um card de partida padrão.
     * @param {object} match - Os dados da partida.
     * @param {string} matchId - O ID da partida.
     * @returns {string} O HTML do card.
     */
    function createMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jfif';
        const creatorNameStyle = "font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 5px;";
        
        let actionButtonHTML;
        // Verifica se o usuário está inscrito para exibir o botão correto
        if (registeredMatchIds.has(matchId)) {
            actionButtonHTML = `<button class="btn btn-success" style="flex-grow: 1;" disabled>Inscrito</button>`;
        } else {
            actionButtonHTML = `<button class="btn-cadastrar-match" onclick="cadastrarEmPartida('${matchId}')">Cadastrar</button>`;
        }

        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <div>
                        <h3>${match.nome}</h3>
                        <p>${formattedDate} - ${match.local}</p>
                        <div style="${creatorNameStyle}"><i class="fa-solid fa-user"></i> ${match.creatorName || ''}</div>
                    </div>
                    <div class="match-card-actions">
                        <button class="btn-details" onclick="openMatchDetails('${matchId}')">Ver Detalhes</button>
                        ${actionButtonHTML}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Gera o HTML para um slide do carrossel.
     * @param {object} match - Os dados da partida.
     * @param {string} matchId - O ID da partida.
     * @returns {string} O HTML do slide.
     */
    function createCarouselSlide(match, matchId) {
        const imageUrl = match.imagemURL || 'imagens/campo.jfif';
        const tipoPartida = match.tipo.charAt(0).toUpperCase() + match.tipo.slice(1);

        let actionButtonHTML;
        if (registeredMatchIds.has(matchId)) {
            actionButtonHTML = `<button class="btn btn-success" disabled>Inscrito</button>`;
        } else {
            actionButtonHTML = `<button class="btn-cadastrar-match" onclick="cadastrarEmPartida('${matchId}')">Cadastrar</button>`;
        }

        return `
            <div class="slide" data-match-id="${matchId}">
                <img src="${imageUrl}" class="carrossel-img" alt="${match.nome}" onclick="openMatchDetails('${matchId}')">
                <div class="slide-content">
                    <h3 onclick="openMatchDetails('${matchId}')">${match.nome}</h3>
                    <p>${tipoPartida} - ${match.local}</p>
                    ${actionButtonHTML}
                </div>
            </div>
        `;
    }

    /**
     * Gera o HTML para um card na seção "Minhas Partidas Criadas".
     * @param {object} match - Os dados da partida.
     * @param {string} matchId - O ID da partida.
     * @returns {string} O HTML do card.
     */
    function createMyMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jfif';
        const creatorNameStyle = "font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 5px;";

        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <div>
                        <h3>${match.nome}</h3>
                        <p>${formattedDate} - ${match.local}</p>
                        <div style="${creatorNameStyle}"><i class="fa-solid fa-user"></i> ${match.creatorName || ''}</div>
                    </div>
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

    /**
     * Gera o HTML para um card na seção "Meus Jogos Cadastrados".
     * @param {object} match - Os dados da partida.
     * @param {string} matchId - O ID da partida.
     * @returns {string} O HTML do card.
     */
    function createRegisteredMatchCard(match, matchId) {
        const formattedDate = formatDateToPtBr(match.data);
        const imageUrl = match.imagemURL || 'imagens/campo.jfif';
        const creatorNameStyle = "font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 5px;";

        return `
            <div class="match-card" data-match-id="${matchId}">
                <img src="${imageUrl}" class="match-card-img" alt="Imagem da partida ${match.nome}">
                <div class="match-card-content">
                    <div>
                        <h3>${match.nome}</h3>
                        <p>${formattedDate} - ${match.local}</p>
                        <div style="${creatorNameStyle}"><i class="fa-solid fa-user"></i> ${match.creatorName || ''}</div>
                    </div>
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

    /**
     * Redireciona o usuário para a página de inscrição da partida.
     * @param {string} matchId - O ID da partida.
     */
    async function cadastrarEmPartida(matchId) {
        if (!matchId || !currentUser) {
            return showToast('ID da partida ou usuário não encontrado.', 'error');
        }
        toggleLoading(true);
        try {
            // Verifica se o usuário já está cadastrado para evitar redirecionamento desnecessário
            const playerDocRef = db.collection('partidas').doc(matchId).collection('jogadores').doc(currentUser.uid);
            const playerDoc = await playerDocRef.get();

            if (playerDoc.exists) {
                toggleLoading(false);
                showToast('Você já está cadastrado nesta partida.', 'info');
            } else {
                window.location.href = `cadastrojogador.html?matchId=${matchId}`;
            }
        } catch (error) {
            console.error("Erro ao verificar inscrição na partida:", error);
            toggleLoading(false);
            showToast('Ocorreu um erro ao verificar sua inscrição.', 'error');
        }
    }

    /**
     * Redireciona para a página de edição de inscrição.
     * @param {string} matchId - O ID da partida.
     */
    function alterarInscricao(matchId) {
        if (!matchId) return showToast('ID da partida não encontrado.', 'error');
        window.location.href = `cadastrojogador.html?matchId=${matchId}&edit=true`;
    }

    /**
     * Redireciona para a página de edição de partida.
     * @param {string} matchId - O ID da partida.
     */
    function editMatch(matchId) {
        window.location.href = `criar.html?id=${matchId}`;
    }

    /**
     * Deleta uma partida criada pelo usuário.
     * @param {string} matchId - O ID da partida.
     */
    function deleteMatch(matchId) {
        openConfirmModal('Excluir Partida', 'Você tem certeza?', async () => {
            toggleLoading(true);
            try {
                await db.collection('partidas').doc(matchId).delete();
                showToast('Partida excluída!', 'success');
                fetchAndDisplayMatches(); // Atualiza as listas
                fetchAndDisplayMyMatches();
            } catch (error) {
                console.error('Erro ao excluir partida:', error);
                showToast('Erro ao excluir.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }

    /**
     * Cancela a inscrição do usuário em uma partida.
     * @param {string} matchId - O ID da partida.
     */
    async function cancelarInscricao(matchId) {
        if (!currentUser) return;
        openConfirmModal('Cancelar Inscrição', 'Tem certeza?', async () => {
            toggleLoading(true);
            try {
                await db.collection('partidas').doc(matchId).collection('jogadores').doc(currentUser.uid).delete();
                
                registeredMatchIds.delete(matchId); // Remove o ID do conjunto de inscrições
                fetchAndDisplayRegisteredMatches(); // Atualiza as listas
                fetchAndDisplayMatches();
                
                showToast('Inscrição cancelada.', 'success');
            } catch (error) {
                console.error('Erro ao cancelar inscrição:', error);
                showToast('Erro ao cancelar.', 'error');
            } finally {
                toggleLoading(false);
            }
        });
    }
    
    // =================================================================================
    // 7. FUNÇÕES GERAIS DA INTERFACE (MODAIS, UI, FILTROS, PERFIL, ETC.)
    // =================================================================================
    
    /**
     * Salva os filtros de local e tipo no localStorage para persistência.
     */
    function saveFiltersToLocalStorage() {
        localStorage.setItem('matchScore_filterLocal', ui.filterLocal.value);
        localStorage.setItem('matchScore_filterType', ui.filterType.value);
    }

    /**
     * Carrega os filtros do localStorage quando a página é carregada.
     */
    function loadFiltersFromLocalStorage() {
        const savedLocal = localStorage.getItem('matchScore_filterLocal');
        const savedType = localStorage.getItem('matchScore_filterType');

        if (savedLocal) ui.filterLocal.value = savedLocal;
        if (savedType) ui.filterType.value = savedType;
    }

    /**
     * Fecha todos os modais abertos.
     */
    function closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            if (modal.id !== 'confirmModal') {
                modal.classList.remove('active');
            }
        });
        if (document.querySelectorAll('.modal.active').length === 0) {
            document.body.style.overflow = 'auto'; // Restaura o scroll do body
        }
    }

    /**
     * Abre um modal específico.
     * @param {string} modalId - O ID do elemento modal.
     */
    function openModal(modalId) {
        if (modalId !== 'confirmModal') closeAllModals(); 
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Impede o scroll do body
            if (modalId === 'notificationsModal') {
                markNotificationsAsRead(); // Marca as notificações como lidas ao abrir o modal
            }
        }
    }

    /**
     * Fecha um modal específico.
     * @param {string} modalId - O ID do elemento modal.
     */
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
        if (document.querySelectorAll('.modal.active').length === 0) {
            document.body.style.overflow = 'auto';
        }
    }

    /**
     * Abre um modal de confirmação genérico.
     * @param {string} title - O título do modal.
     * @param {string} message - A mensagem de confirmação.
     * @param {function} onConfirmCallback - A função a ser executada se o usuário confirmar.
     */
    function openConfirmModal(title, message, onConfirmCallback) {
        openModal('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmBtn = document.getElementById('confirmBtn');
        if (!confirmTitle || !confirmMessage || !confirmBtn) return;
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        // Clona e substitui o botão para remover listeners antigos e evitar múltiplos cliques
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', () => {
            onConfirmCallback();
            closeModal('confirmModal');
        }, { once: true });
    }

    /**
     * Alterna a visibilidade do menu lateral (sidebar).
     * @param {boolean} [forceOpen] - Força a abertura ou fechamento.
     */
    function toggleSidebar(forceOpen) {
        const isOpen = ui.sidebar.classList.contains('open');
        const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
        ui.sidebar.classList.toggle('open', shouldOpen);
        if (ui.sidebarOverlay) {
            ui.sidebarOverlay.classList.toggle('active', shouldOpen);
        }
    }

    /**
     * Exibe uma seção principal da página e oculta as outras.
     * @param {string} sectionId - O ID da seção a ser exibida (ex: 'home', 'friends').
     */
    function showSection(sectionId) {
        closeAllModals(); 
        document.querySelectorAll('.page-section').forEach(section => {
            section.style.display = 'none';
        });
        const content = document.getElementById(`${sectionId}-content`);
        if (content) content.style.display = 'block';
        
        // Se a seção for de amigos, ativa a primeira aba por padrão
        if(sectionId === 'friends') {
            changeFriendsTab('all', ui.friendsTabs[0]);
        }

        // Fecha o sidebar em telas pequenas após selecionar um item
        if (window.innerWidth <= 768 && ui.sidebar.classList.contains('open')) {
            toggleSidebar(false);
        }
    }

    /**
     * Carrega os dados do perfil do usuário do Firestore e os exibe no modal de perfil.
     */
    async function loadUserProfile() {
        if (!currentUser) return;
        try {
            const doc = await db.collection('usuarios').doc(currentUser.uid).get();
            if (doc.exists) {
                const data = doc.data();
                ui.profilePicPreview.src = data.fotoURL || 'imagens/perfil.png';
                ui.profileInfoDiv.innerHTML = `<p><strong>Nome:</strong> ${data.nome || ''}</p><p><strong>Email:</strong> ${data.email || ''}</p><p><strong>Telefone:</strong> ${data.telefone || ''}</p><p><strong>Data Nasc:</strong> ${formatDateToPtBr(data.dataNascimento) || ''}</p><p><strong>Posição:</strong> ${data.posicao || ''}</p>`;
                const isDark = (data.theme !== 'light');
                applyTheme(isDark); // Aplica o tema salvo do usuário
            } else {
                showToast("Perfil não encontrado.", "error");
            }
        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
            showToast("Erro ao carregar seu perfil.", "error");
        }
    }

    /**
     * Alterna a UI para o modo de edição de perfil.
     */
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

    /**
     * Sai do modo de edição de perfil.
     * @param {boolean} [forceReload=false] - Se true, recarrega os dados do perfil do Firestore.
     */
    function exitEditMode(forceReload = false) {
        ui.profileInfoDiv.style.display = 'block';
        ui.profileEditForm.style.display = 'none';
        ui.editProfileBtn.style.display = 'block';
        if (forceReload) loadUserProfile();
    }

    /**
     * Salva as alterações feitas no perfil do usuário.
     */
    async function saveProfileChanges() {
        if (!currentUser) return;

        const newName = document.getElementById('editNome').value.trim();
        const dataToUpdate = {
            nome: newName,
            nome_lowercase: newName.toLowerCase(), // Atualiza o campo de busca
            email: document.getElementById('editEmail').value.trim(),
            telefone: document.getElementById('editTelefone').value.trim(),
            dataNascimento: document.getElementById('editDataNascimento').value,
            posicao: document.getElementById('editPosicao').value
        };
        try {
            toggleLoading(true);
            await db.collection('usuarios').doc(currentUser.uid).set(dataToUpdate, { merge: true });
            showToast('Perfil atualizado com sucesso!', 'success');
            exitEditMode(true); // Sai do modo de edição e recarrega os dados
        } catch (error) {
            console.error('Erro ao salvar perfil:', error);
            showToast('Erro ao salvar perfil.', 'error');
        } finally {
            toggleLoading(false);
        }
    }

    /**
     * Lida com a seleção de uma nova foto de perfil.
     * @param {Event} event - O evento de mudança do input de arquivo.
     */
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
                loadUserProfile(); // Recarrega o perfil para reverter a imagem em caso de erro
            } finally {
                toggleLoading(false);
            }
        });
        event.target.value = ''; // Limpa o input para permitir selecionar o mesmo arquivo novamente
    }

    /**
     * Aplica o tema (claro/escuro) à página.
     * @param {boolean} isDark - True para tema escuro, false para tema claro.
     */
    function applyTheme(isDark) {
        document.body.classList.toggle('light-mode', !isDark);
        ui.themeToggle.checked = isDark;
    }

    /**
     * Realiza o logout do usuário.
     */
    async function logout() {
        openConfirmModal('Sair da Conta', 'Você tem certeza que deseja sair?', async () => {
            try {
                await auth.signOut();
                localStorage.removeItem('isLoggedIn'); // Limpa o estado de login
                window.location.href = 'index.html';
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
                showToast("Erro ao sair.", "error");
            }
        });
    }
    
    /**
     * Configura a lógica do carrossel (navegação, responsividade).
     */
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
        window.onresize = atualizarCarousel; // Atualiza o carrossel ao redimensionar a janela
        atualizarCarousel();
    }

    /**
     * Formata uma data do formato 'AAAA-MM-DD' para 'DD/MM/AAAA'.
     * @param {string} dateInput - A data a ser formatada.
     * @returns {string} A data formatada.
     */
    function formatDateToPtBr(dateInput) {
        if (!dateInput) return '';
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    }

    // =================================================================================
    // 8. CONFIGURAÇÃO DOS EVENT LISTENERS
    // =================================================================================

    // Atribui funções ao objeto 'window' para que possam ser chamadas a partir do HTML (ex: onclick="logout()").
    // Isso é uma forma de expor as funções do módulo para o escopo global de forma controlada.
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
        removeFriend,
        showInviteFriendsModal,
        sendMatchInvite,
        goToMatchRegistration,
        shareMatch
    });
    
    if (ui.friendsSearchBar) {
        ui.friendsSearchBar.addEventListener('keydown', handleFriendSearch);
    }
    if (ui.sidebarOverlay) {
        ui.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }

    // Carrega filtros salvos e adiciona listeners para salvar novas alterações
    loadFiltersFromLocalStorage();
    ui.filterDate.addEventListener('change', fetchAndDisplayMatches);
    ui.filterLocal.addEventListener('input', () => {
        fetchAndDisplayMatches();
        saveFiltersToLocalStorage();
    });
    ui.filterType.addEventListener('change', () => {
        fetchAndDisplayMatches();
        saveFiltersToLocalStorage();
    });
    ui.clearFiltersBtn.addEventListener('click', () => {
        ui.filterDate.value = '';
        ui.filterLocal.value = '';
        ui.filterType.value = '';
        localStorage.removeItem('matchScore_filterLocal');
        localStorage.removeItem('matchScore_filterType');
        fetchAndDisplayMatches();
    });

    // Listener para o botão de alterar tema
    ui.themeToggle.addEventListener('change', () => {
        const isDark = ui.themeToggle.checked;
        applyTheme(isDark);
        if (currentUser) {
            // Salva a preferência de tema do usuário no Firestore
            db.collection('usuarios').doc(currentUser.uid).set({ theme: isDark ? 'dark' : 'light' }, { merge: true });
        }
    });

    // Listener para o input de mudança de foto de perfil
    ui.profileImageInputEdit.addEventListener('change', handleProfileImageChange);

    // Listener para fechar modais clicando na área de overlay (fora do modal-box)
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Ponto de entrada inicial da UI: exibe a seção 'home' por padrão.
    showSection('home');
});