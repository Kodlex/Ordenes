// ====== Configuración Firebase (Mantén tus datos reales aquí) ======
const firebaseConfig = {
    apiKey: "AIzaSyA6D0F9Ex3K7h2__PlNaMiREkeaa1StVkc", 
    authDomain: "ordenes-instalacion.firebaseapp.com",
    projectId: "ordenes-instalacion",
    storageBucket: "ordenes-instalacion.firebasestorage.app",
    messagingSenderId: "424944239546",
    appId: "1:424944239546:web:b6c783855ae4f3b0799383",
    measurementId: "G-B2K0XR5D5K"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d) ? null : d;
}

class EquipoPanel {
    constructor() {
        this.equipoId = localStorage.getItem('equipoId'); 
        this.unsubscribe = null; // Para órdenes pendientes
        this.checkLogin();
        this.materialesLista = [
            // Fibra
            { id: 'drop', label: 'Drop', unidad: 'mts', type: 'number', grupo: 'fibra' },
            { id: 'conectorFTTH', label: 'Conector', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'router', label: 'Router', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'patchcord', label: 'Patchcord', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'miniNodo', label: 'MiniNodo', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'preformada', label: 'Preformada', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'botella', label: 'Botella', unidad: 'uds', type: 'number', grupo: 'fibra' },
            { id: 'fuente', label: 'Fuente', unidad: 'uds', type: 'number', grupo: 'fibra' },
            // Coaxial
            { id: 'coaxial', label: 'Coaxial', unidad: 'mts', type: 'number', grupo: 'coaxial' },
            { id: 'conectorRG6', label: 'RG6', unidad: 'uds', type: 'number', grupo: 'coaxial' },
            { id: 'splitter', label: 'Splitter', unidad: 'uds', type: 'number', grupo: 'coaxial' },
            // Varios
            { id: 'grampas', label: 'Grampas', unidad: 'uds', type: 'number', grupo: 'varios' },
            { id: 'conectorRJ45', label: 'RJ45', unidad: 'uds', type: 'number', grupo: 'varios' },
            { id: 'tornillos', label: 'Tornillos', unidad: 'uds', type: 'number', grupo: 'varios' },
            { id: 'piton', label: 'Pitón', unidad: 'uds', type: 'number', grupo: 'varios' },
            { id: 'hebilla', label: 'Hebilla', unidad: 'uds', type: 'number', grupo: 'varios' },
            // Observaciones
            { id: 'otros', label: 'Otros Materiales (Obs.)', unidad: 'observación', type: 'text', grupo: 'otros' }
        ];
        this.init();
    }

    checkLogin() {
        const userType = localStorage.getItem('userType');
        const equipoId = localStorage.getItem('equipoId');
        if (userType !== 'equipo' || !equipoId) {
            window.location.href = 'login.html';
        } else {
            document.getElementById('userDisplay').textContent = `Equipo ${equipoId}`;
        }
    }

    init() {
        document.getElementById('logoutBtn').addEventListener('click', this.logout);
        this.initEventListeners();
        
        // Carga inicial de la pestaña activa (Pendientes)
        const activeTab = document.querySelector('.nav-link.active');
        const activeTabId = activeTab ? activeTab.getAttribute('data-bs-target').substring(1) : 'pending';
        if (activeTabId === 'pending') {
            this.loadTeamOrdersRealtime();
        } 
    }

    initEventListeners() {
        const navTabs = document.getElementById('myTab');
        if (navTabs) {
            navTabs.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('data-bs-target').substring(1);
                if (targetId === 'pending') {
                    this.loadTeamOrdersRealtime();
                } else if (targetId === 'completed') {
                    this.fetchAndRenderCompletedOrders(); // Carga las completadas al abrir
                }
            });
        }
        
        const filterTipoOrdenEl = document.getElementById('filterTipoOrden');
        const filterDateStartEl = document.getElementById('filterDateStart');
        const filterDateEndEl = document.getElementById('filterDateEnd');

        // Tipo de Orden: Filtro en el cliente (visual)
        if (filterTipoOrdenEl) filterTipoOrdenEl.addEventListener('change', () => this.applyClientSideFilters());
        
        // Rango de Fechas: Requiere una nueva consulta a Firebase (Server-Side)
        const serverFilterHandler = () => this.fetchAndRenderCompletedOrders();
        if (filterDateStartEl) filterDateStartEl.addEventListener('change', serverFilterHandler);
        if (filterDateEndEl) filterDateEndEl.addEventListener('change', serverFilterHandler);
    }

    logout() {
        localStorage.removeItem('userType');
        localStorage.removeItem('equipoId');
        window.location.href = 'login.html';
    }

    // --- LÓGICA DE ÓRDENES PENDIENTES ---
    loadTeamOrdersRealtime() {
        const container = document.getElementById('teamOrdersContainer');
        const equipoId = this.equipoId; 

        if (!container || !equipoId) return;
        
        if (this.unsubscribe) {
            this.unsubscribe(); // Desuscribir la escucha anterior
            this.unsubscribe = null;
        }
        
        // ESTA CONSULTA REQUIERE EL ÍNDICE COMPUESTO EN FIRESTORE
        const q = db.collection('ordenes')
                    .where('estado', '==', 'pendiente')
                    .where('instalacion.equipo', '==', equipoId)
                    .orderBy('instalacion.fecha', 'asc'); // Ordenar por fecha de instalación

        this.unsubscribe = q.onSnapshot(snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No tienes órdenes pendientes</h5></div>`;
            } else {
                container.innerHTML = docs.map(o => this.createOrderCard(o)).join('');
            }
        }, err => {
            console.error('Error listener equipo:', err);
            // Mensaje de error personalizado en caso de fallo (normalmente por el índice)
            container.innerHTML = `<div class="col-12 alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar las órdenes pendientes.
                <p class="mb-0 small"><strong>Revisa la consola (F12)</strong> para el mensaje de Firebase, probablemente debas crear un **Índice Compuesto**.</p>
            </div>`;
        });
    }

    // --- LÓGICA DE ÓRDENES COMPLETADAS (MODIFICADA: Límite 20) ---

    async fetchAndRenderCompletedOrders() {
        const container = document.getElementById('completedOrdersContainer');
        if (!container) return;

        // Obtener filtros de fecha
        const filterDateStartEl = document.getElementById('filterDateStart');
        const filterDateEndEl = document.getElementById('filterDateEnd');
        const selectedDateStart = filterDateStartEl ? filterDateStartEl.value : null;
        const selectedDateEnd = filterDateEndEl ? filterDateEndEl.value : null;
        
        // Mostrar cargando
        container.innerHTML = `<div class="col-12 text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><h5 class="mt-2 text-primary">Cargando historial...</h5></div>`;
        
        let q = db.collection('ordenes')
            .where('estado', '==', 'completado')
            .where('instalacion.equipo', '==', this.equipoId);

        let messageLimit = 'Se muestra el historial completo.';

        if (selectedDateStart || selectedDateEnd) {
             // Si hay filtro de fecha, aplicar rango en Firebase
            let dateStart = selectedDateStart ? new Date(selectedDateStart) : null;
            let dateEnd = selectedDateEnd ? new Date(selectedDateEnd) : null;

            if (dateStart) {
                dateStart.setHours(0, 0, 0, 0);
                q = q.where('fechaCompletado', '>=', firebase.firestore.Timestamp.fromDate(dateStart));
            }

            if (dateEnd) {
                dateEnd.setHours(23, 59, 59, 999);
                q = q.where('fechaCompletado', '<=', firebase.firestore.Timestamp.fromDate(dateEnd));
            }
            messageLimit = `Órdenes filtradas del ${selectedDateStart || 'Inicio'} al ${selectedDateEnd || 'Fin'}.`;
        } else {
            // Sin filtro de fecha, limitar la carga a las últimas N órdenes para optimizar
            const defaultLimit = 20; // <--- Límite de 20 Órdenes
            q = q.limit(defaultLimit);
            messageLimit = `Se muestran las últimas ${defaultLimit} órdenes completadas. Use el filtro de fecha para cargar más.`;
        }
        
        // Ordenar siempre por fechaCompletado descendente
        q = q.orderBy('fechaCompletado', 'desc');

        try {
            const snapshot = await q.get(); 
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No hay órdenes completadas para este equipo en el rango seleccionado.</h5></div>`;
                return;
            }

            // Renderizar Tabla
            const tableHtml = `
                <div class="alert alert-info py-2 small" role="alert">
                    Total de órdenes cargadas: ${docs.length}. ${messageLimit}
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover table-sm" id="completedOrdersTable">
                        <thead class="table-dark">
                            <tr>
                                <th>Cliente</th>
                                <th>N° Cliente</th>
                                <th>Dirección</th>
                                <th>Plan</th>
                                <th>Tipo</th>
                                <th>Comentario</th>
                                <th>Fecha Completado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${docs.map(o => this.createCompletedOrderRow(o)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = tableHtml;
            
            // Aplicar filtros de tipo de orden (client-side)
            this.applyClientSideFilters(); 

        } catch (err) {
            console.error('Error fetching completed orders:', err);
            container.innerHTML = `<div class="col-12 text-danger">Error cargando historial de órdenes. Revise la consola.</div>`;
        }
    }
    
    // Función para crear la fila del historial
    createCompletedOrderRow(order) {
        const fechaCompletado = toDate(order.fechaCompletado);
        const fechaTxt = fechaCompletado ? fechaCompletado.toLocaleString('es-ES') : '-';
        const tipo = order.tipo || 'otros';

        const colors = {
            'Instalacion': 'bg-primary',
            'Mudanza': 'bg-warning text-dark',
            'Reconversion': 'bg-purple',
            'Extension': 'bg-success',
            'Presupuesto': 'bg-secondary',
            'otros': 'bg-danger'
        };
        const badgeClass = colors[tipo] || 'bg-secondary';
        
        const observacion = order.materialesGastados?.comentario || order.descripcion || '-';
        
        // Atributo para Filtro de Tipo (client-side)
        const tipoData = tipo.toLowerCase();

        return `
            <tr data-tipo-orden="${tipoData}">
                <td>${order.cliente?.nombre || '-'}</td>
                <td>${order.cliente?.numeroCliente || '-'}</td>
                <td>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</td>
                <td>${order.instalacion?.plan || '-'}</td>
                <td><span class="badge ${badgeClass} px-2 py-1">${tipo}</span></td>
                <td>${observacion.substring(0, 50).replace(/\n/g, ' ')}...</td>
                <td>${fechaTxt}</td>
            </tr>
        `;
    }

    // Función para aplicar filtro de tipo de orden (en cliente)
    applyClientSideFilters() {
        const filterTipoOrdenEl = document.getElementById('filterTipoOrden');

        if (!filterTipoOrdenEl) return; 

        const selectedTipoOrden = filterTipoOrdenEl.value;
        
        const tableContainer = document.getElementById('completedOrdersContainer');
        if (!tableContainer) return;

        // Selecciona todas las filas de la tabla cargada
        const orderRows = tableContainer.querySelectorAll('tbody tr[data-tipo-orden]'); 

        orderRows.forEach(row => {
            const rowTipoOrden = row.getAttribute('data-tipo-orden');
            
            // FILTRO 1: Tipo de Orden
            const matchTipoOrden = selectedTipoOrden === 'todos' || rowTipoOrden === selectedTipoOrden;

            // Mostrar u ocultar la fila
            if (matchTipoOrden) {
                row.style.display = ''; // Mostrar
            } else {
                row.style.display = 'none'; // Ocultar
            }
        });
    }

    // --- MÉTODOS EXISTENTES PARA LA PESTAÑA PENDIENTES (Sin modificaciones funcionales) ---

    createMaterialInput(materialId, label, unidad, type = 'number', orderId) {
        const step = type === 'number' ? 'step="1" min="0"' : '';
        
        if (type === 'text') { // Caso especial para 'Otros'
             return `
                <div class="col-12 mb-3">
                    <label for="${materialId}-${orderId}" class="form-label small mb-0">${label}</label>
                    <textarea class="form-control form-control-sm" id="${materialId}-${orderId}" name="${materialId}" rows="1" placeholder="Detalle otros materiales y/o unidades"></textarea>
                </div>
            `;
        }

        // Input numérico estándar con Input Group para la unidad
        return `
            <div class="col-6 col-md-4 col-lg-3 mb-3">
                <label for="${materialId}-${orderId}" class="form-label small mb-0">${label}</label>
                <div class="input-group input-group-sm">
                    <input type="number" class="form-control text-end material-input" id="${materialId}-${orderId}" name="${materialId}" value="0" ${step} placeholder="0">
                    <span class="input-group-text p-1" style="font-size:0.7rem; width: 45px;">${unidad}</span>
                </div>
            </div>
        `;
    }

    getMaterialInputsByGroup(groupName, orderId) {
        return this.materialesLista
            .filter(m => m.grupo === groupName && m.type === 'number')
            .map(m => this.createMaterialInput(m.id, m.label, m.unidad, m.type, orderId)).join('');
    }

    createOrderCard(order) {
        const fechaInst = toDate(order.instalacion?.fecha);
        const fechaTxt = fechaInst ? fechaInst.toLocaleString('es-ES') : '-';
        const tipo = order.tipo || 'otros';

        const colors = {
            'Instalacion': 'bg-primary',
            'Mudanza': 'bg-warning text-dark',
            'Reconversion': 'bg-purple',
            'Extension': 'bg-success',
            'Presupuesto': 'bg-secondary',
            'otros': 'bg-danger'
        };
        const headerClass = colors[tipo] || 'bg-secondary';

        const ubicacionLink = order.domicilio?.ubicacion ? `<a href="${order.domicilio.ubicacion}" target="_blank">Ver en Maps</a>` : '-';

        const fibraInputs = this.getMaterialInputsByGroup('fibra', order.id);
        const coaxialInputs = this.getMaterialInputsByGroup('coaxial', order.id);
        const variosInputs = this.getMaterialInputsByGroup('varios', order.id);
        const otherMaterial = this.materialesLista
            .filter(m => m.id === 'otros')
            .map(m => this.createMaterialInput(m.id, m.label, m.unidad, m.type, order.id)).join('');


        return `
            <div class="col-md-6 col-lg-4">
                <div class="card order-card mb-3">
                    <div class="card-header ${headerClass} d-flex justify-content-between align-items-center">
                        <span>Orden #${order.id.substr(-6)}</span>
                        <span class="badge bg-light text-dark">${tipo}</span>
                    </div>
                    <div class="card-body">
                        <h6 class="card-title text-primary">${order.cliente?.nombre || '-'}</h6>
                        <p class="small text-muted mb-1">Creada por: <strong>${order.creadoPor || '-'}</strong></p>
                        <p class="small mb-1"><i class="fas fa-id-card me-2"></i>DNI: ${order.cliente?.dni || '-'}</p>
                        <p class="small mb-1"><strong>N° Cliente:</strong> ${order.cliente?.numeroCliente || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-phone me-2"></i>Teléfono: ${order.cliente?.telefono || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-map-marker-alt me-2"></i>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</p>
                        <p class="small mb-1"><strong>Ubicación:</strong> ${ubicacionLink}</p>
                        <p class="small mb-1"><strong>Plan:</strong> ${order.instalacion?.plan || '-'}</p>
                        <p class="small mb-1"><strong>Instalar:</strong> ${fechaTxt}</p>
                        <p class="small mb-1"><strong>Descripción:</strong> ${order.descripcion || '-'}</p>
                        
                        <hr>
                        
                        <form id="materialsForm-${order.id}" onsubmit="event.preventDefault(); teamPanel.markCompleted('${order.id}')">
                            <h6 class="text-secondary mt-3 mb-2"><i class="fas fa-boxes me-2"></i>Finalización de Orden</h6>

                            <div class="mb-3">
                                <label class="form-label small mb-1">¿Se utilizaron materiales?</label>
                                <div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="materialesUsados" id="matYes-${order.id}" value="si" required onclick="document.getElementById('materialsDetail-${order.id}').style.display='block';">
                                        <label class="form-check-label" for="matYes-${order.id}">Sí</label>
                                    </div>
                                    <div class="form-check form-check-inline">
                                        <input class="form-check-input" type="radio" name="materialesUsados" id="matNo-${order.id}" value="no" required checked onclick="document.getElementById('materialsDetail-${order.id}').style.display='none';">
                                        <label class="form-check-label" for="matNo-${order.id}">No</label>
                                    </div>
                                </div>
                            </div>

                            <div id="materialsDetail-${order.id}" style="display: none; border: 1px solid #ddd; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                                <h6 class="text-primary small mb-3"><i class="fas fa-hammer me-1"></i>Registro de Materiales</h6>
                                
                                <div class="accordion accordion-flush accordion-sm" id="accordionMaterials-${order.id}">
                                    
                                    <div class="accordion-item">
                                        <h2 class="accordion-header">
                                            <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFibra-${order.id}">
                                                <i class="fas fa-plug me-2"></i> Fibra Óptica / GPON
                                            </button>
                                        </h2>
                                        <div id="collapseFibra-${order.id}" class="accordion-collapse collapse" data-bs-parent="#accordionMaterials-${order.id}">
                                            <div class="accordion-body pt-3 pb-0">
                                                <div class="row">
                                                    ${fibraInputs}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="accordion-item">
                                        <h2 class="accordion-header">
                                            <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCoaxial-${order.id}">
                                                <i class="fas fa-cable-car me-2"></i> Coaxial / HFC
                                            </button>
                                        </h2>
                                        <div id="collapseCoaxial-${order.id}" class="accordion-collapse collapse" data-bs-parent="#accordionMaterials-${order.id}">
                                            <div class="accordion-body pt-3 pb-0">
                                                <div class="row">
                                                    ${coaxialInputs}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="accordion-item">
                                        <h2 class="accordion-header">
                                            <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVarios-${order.id}">
                                                <i class="fas fa-screwdriver-wrench me-2"></i> Herrajes y Varios
                                            </button>
                                        </h2>
                                        <div id="collapseVarios-${order.id}" class="accordion-collapse collapse" data-bs-parent="#accordionMaterials-${order.id}">
                                            <div class="accordion-body pt-3 pb-0">
                                                <div class="row">
                                                    ${variosInputs}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>

                                <hr class="my-3">
                                <div class="row">
                                    ${otherMaterial}
                                </div>
                            </div>

                            <div class="col-12 mb-3">
                                <label for="comentario-${order.id}" class="form-label small mb-0">Comentario General/Observación</label>
                                <textarea class="form-control form-control-sm" id="comentario-${order.id}" name="comentario" rows="2" placeholder="Observaciones adicionales sobre la orden, estado del trabajo o el cliente..."></textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-success btn-sm w-100 mt-2"><i class="fas fa-check me-1"></i>Marcar como Completada</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    async markCompleted(id) {
        const form = document.getElementById(`materialsForm-${id}`);
        
        const materialesUsadosRadio = form.querySelector('input[name="materialesUsados"]:checked');
        const materialesUsados = materialesUsadosRadio ? materialesUsadosRadio.value === 'si' : false;

        const materialsData = {};
        const teamId = this.equipoId; 
        const batch = db.batch(); // INICIAR TRANSACCIÓN BATCH

        if (materialesUsados) {
            this.materialesLista.forEach(m => {
                const input = form.querySelector(`[name="${m.id}"]`);
                if (input) {
                    if (m.type === 'number') {
                        const value = parseInt(input.value) || 0;
                        materialsData[m.id] = value;
                        
                        // LÓGICA DE DESCUENTO DE STOCK ASIGNADO (stockEquipos)
                        if (value > 0) {
                             const equipoRef = db.collection('stockEquipos').doc(`equipo_${teamId}`);
                             // Descuenta stock asignado al equipo
                             batch.update(equipoRef, {
                                 [m.id]: firebase.firestore.FieldValue.increment(-value)
                             });
                        }
                    } else { 
                        materialsData[m.id] = input.value.trim();
                    }
                }
            });
        }
        
        const comentarioInput = form.querySelector('[name="comentario"]');
        materialsData.comentario = comentarioInput ? comentarioInput.value.trim() : '';

        // Actualizar la orden como completada (colección 'ordenes')
        const orderRef = db.collection('ordenes').doc(id);
        batch.update(orderRef, {
            estado: 'completado',
            fechaCompletado: firebase.firestore.FieldValue.serverTimestamp(),
            materialesGastados: materialsData 
        });

        try {
            await batch.commit(); // EJECUTAR TODAS LAS OPERACIONES (orden y stock)
            alert('✅ ¡Orden completada y stock descontado con éxito!');
        } catch(err) {
            console.error('Error marcando completada o descontando stock:', err);
            alert('⚠️ Advertencia: La orden se marcó como completada, pero hubo un error al descontar el stock. Revise el panel de stock.');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.teamPanel = new EquipoPanel();
});

