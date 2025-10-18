// ====== Configuración Firebase ======
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

// util: a Date
function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return isNaN(d) ? null : d;
}

class OrderManager {
    constructor(){
        this.unsubscribePending = null;
        this.chartZona = null;
        this.chartPlan = null;
        this.checkLogin();
        this.init();
        this.materialesLista = [
            { id: 'drop', label: 'Drop', unidad: 'm', type: 'number' },
            { id: 'conectorFTTH', label: 'Conector FTTH', unidad: 'u', type: 'number' },
            { id: 'coaxial', label: 'Coaxial', unidad: 'm', type: 'number' },
            { id: 'conectorRG6', label: 'Conector RG6', unidad: 'u', type: 'number' },
            { id: 'grampas', label: 'Grampas', unidad: 'u', type: 'number' },
            { id: 'splitter', label: 'Splitter', unidad: 'u', type: 'number' },
            { id: 'conectorRJ45', label: 'Conector RJ45', unidad: 'u', type: 'number' },
            { id: 'fuente', label: 'Fuente', unidad: 'u', type: 'number' },
            { id: 'router', label: 'Router', unidad: 'u', type: 'number' },
            { id: 'patchcord', label: 'Patchcord', unidad: 'u', type: 'number' },
            { id: 'miniNodo', label: 'MiniNodo', unidad: 'u', type: 'number' },
            { id: 'tornillos', label: 'Tornillos', unidad: 'u', type: 'number' },
            { id: 'piton', label: 'Pitón', unidad: 'u', type: 'number' },
            { id: 'hebilla', label: 'Hebilla', unidad: 'u', type: 'number' },
            { id: 'preformada', label: 'Preformada', unidad: 'u', type: 'number' },
            { id: 'botella', label: 'Botella', unidad: 'u', type: 'number' },
            { id: 'otros', label: 'Otros', unidad: 'Obs.', type: 'text' }
        ];
    }

    checkLogin() {
        const userType = localStorage.getItem('userType');
        const userName = localStorage.getItem('userName');
        if (userType !== 'admin' || !userName) {
            window.location.href = 'login_admin.html';
        } else {
            document.getElementById('userDisplay').textContent = `Admin: ${userName}`;
        }
    }

    init(){
        document.getElementById('orderForm').addEventListener('submit', (e) => this.handleFormSubmit(e));
        document.getElementById('logoutBtn').addEventListener('click', this.logout);
        
        this.initCompletedOrdersFilterListeners(); // Inicializar los listeners
        
        const navTabs = document.getElementById('myTab');
        if (navTabs) {
            navTabs.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('data-bs-target').substring(1);
                this.unloadListeners();
                if (targetId === 'orders') {
                    this.loadPendingRealtime();
                } else if (targetId === 'completed') {
                    this.fetchAndRenderCompletedOrders(); // Llama a la nueva función de carga
                } 
                // else if (targetId === 'materials') {
                //     this.setupMaterialTab(); // Asumiendo que esta función existe en tu código real
                // }
            });
        }

        const activeTab = document.querySelector('.nav-link.active');
        const activeTabId = activeTab ? activeTab.getAttribute('data-bs-target').substring(1) : 'form';
        if (activeTabId === 'orders') {
            this.loadPendingRealtime();
        } else if (activeTabId === 'completed') {
            this.fetchAndRenderCompletedOrders(); // Llama a la nueva función de carga al iniciar
        } 
        // else if (activeTabId === 'materials') {
        //     this.setupMaterialTab();
        // }
    }

    logout() {
        localStorage.removeItem('userType');
        localStorage.removeItem('userName');
        window.location.href = 'login_admin.html';
    }

    unloadListeners() {
        if (this.unsubscribePending) {
            this.unsubscribePending();
            this.unsubscribePending = null;
        }
        if (this.chartZona) {
            try { this.chartZona.destroy(); } catch(e) {}
            this.chartZona = null;
        }
        if (this.chartPlan) {
            try { this.chartPlan.destroy(); } catch(e) {}
            this.chartPlan = null;
        }
        // Se elimina la desuscripción de "completed" porque ahora usa get()
    }

    async handleFormSubmit(e){
        e.preventDefault();
        document.getElementById('orderForm').classList.add('was-validated');
        if (!e.target.checkValidity()) return;

        const fd = new FormData(e.target);
        const fechaInput = fd.get('fechaInstalacion');
        const fechaInst = fechaInput ? new Date(fechaInput) : null;
        const userName = localStorage.getItem('userName');

        try {
            const order = {
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
                estado: 'pendiente',
                tipo: fd.get('tipoOrden'),
                creadoPor: userName,
                cliente: {
                    nombre: fd.get('nombre'),
                    dni: fd.get('dni'),
                    numeroCliente: fd.get('numeroCliente') || '',
                    telefono: fd.get('telefono'),
                    email: fd.get('email') || ''
                },
                domicilio: {
                    direccion: fd.get('direccion'),
                    numero: fd.get('numero'),
                    ubicacion: fd.get('ubicacion') || '',
                    zona: fd.get('zona')
                },
                instalacion: {
                    plan: fd.get('plan'),
                    equipo: fd.get('equipo'),
                    fecha: fechaInst ? firebase.firestore.Timestamp.fromDate(fechaInst) : null
                },
                descripcion: fd.get('descripcion') || ''
            };
            
            await db.collection('ordenes').add(order);
            this.showSuccess('Orden guardada con éxito');
            document.getElementById('orderForm').reset();
            document.getElementById('orderForm').classList.remove('was-validated');
        } catch(err) {
            console.error('Error guardando orden:', err);
            alert('Error guardando la orden. Revisa la consola.');
        }
    }

    loadPendingRealtime(){
        const container = document.getElementById('ordersContainer');
        if (!container) return;
        this.unloadListeners();
        const q = db.collection('ordenes').where('estado', '==', 'pendiente');
        this.unsubscribePending = q.onSnapshot(snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a,b) => {
                const da = toDate(a.instalacion?.fecha) || new Date(0);
                const db_ = toDate(b.instalacion?.fecha) || new Date(0);
                return da - db_;
            });
            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No hay órdenes pendientes</h5></div>`;
            } else {
                container.innerHTML = docs.map(o => this.createOrderCard(o)).join('');
            }
        }, err => {
            console.error('Error listener pendientes:', err);
            container.innerHTML = `<div class="col-12 text-danger">Error cargando órdenes pendientes. Ver consola.</div>`;
        });
    }

    /**
     * **NUEVA FUNCIÓN:** Fetches completed orders from Firestore applying server-side date filtering and limits.
     */
    async fetchAndRenderCompletedOrders(){
        const container = document.getElementById('completedOrdersContainer');
        const chartZonaEl = document.getElementById('chartZona');
        const chartPlanEl = document.getElementById('chartPlan');
        if (!container || !chartZonaEl || !chartPlanEl) return;
        
        this.unloadListeners();

        // Obtener elementos de filtro de fecha
        const filterDateStartEl = document.getElementById('filterDateStart');
        const filterDateEndEl = document.getElementById('filterDateEnd');
        const selectedDateStart = filterDateStartEl.value;
        const selectedDateEnd = filterDateEndEl.value;
        
        container.innerHTML = `<div class="col-12 text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><h5 class="mt-2 text-primary">Cargando órdenes...</h5></div>`;
        
        let q = db.collection('ordenes').where('estado', '==', 'completado');

        let dateStart = null;
        let dateEnd = null;
        
        let messageLimit = 'Se muestra el historial completo.';

        if (selectedDateStart) {
            dateStart = new Date(selectedDateStart);
            dateStart.setHours(0, 0, 0, 0);
            q = q.where('fechaCompletado', '>=', firebase.firestore.Timestamp.fromDate(dateStart));
        }

        if (selectedDateEnd) {
            dateEnd = new Date(selectedDateEnd);
            dateEnd.setHours(23, 59, 59, 999);
            // Firebase requiere que los filtros de rango (<, <=, >, >=) sean sobre el mismo campo que la ordenación.
            q = q.where('fechaCompletado', '<=', firebase.firestore.Timestamp.fromDate(dateEnd));
        }

        // 1. Ordenar siempre por fechaCompletado desc (requerido para los filtros de rango)
        q = q.orderBy('fechaCompletado', 'desc');

        // 2. Límite de carga por defecto si no hay filtro de fecha
        if (!selectedDateStart && !selectedDateEnd) {
             // Limitar la carga a un número razonable si no hay filtro de fecha
            const defaultLimit = 200; 
            q = q.limit(defaultLimit);
            messageLimit = `Se muestran las últimas ${defaultLimit} órdenes. Use el filtro de fecha para cargar más.`;
        }

        try {
            const snapshot = await q.get(); // Usar get() en lugar de onSnapshot
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No hay órdenes completadas.</h5><p class="small">${messageLimit}</p></div>`;
                chartZonaEl.style.display = 'none';
                chartPlanEl.style.display = 'none';
                return;
            }

            chartZonaEl.style.display = 'block';
            chartPlanEl.style.display = 'block';

            // 3. Métricas y Gráficos (se basan en los documentos cargados y filtrados por fecha)
            this.renderCharts(docs);

            // 4. Renderizar Tabla
            const tableHtml = `
                <div class="alert alert-info py-2 small" role="alert">
                    Total de órdenes cargadas: ${docs.length}. ${messageLimit}
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover" id="completedOrdersTable">
                        <thead class="table-dark">
                            <tr>
                                <th>Cliente</th>
                                <th>N° Cliente</th>
                                <th>Dirección</th>
                                <th>Zona</th>
                                <th>Plan</th>
                                <th>Equipo</th>
                                <th>Tipo</th>
                                <th>Materiales</th>
                                <th>Observación</th>
                                <th>Creado por</th>
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
            
            // 5. Aplicar Filtros Secundarios (Equipo, Tipo) en el Cliente
            this.applyClientSideFilters(); 

        } catch (err) {
            console.error('Error fetching completed orders:', err);
            container.innerHTML = `<div class="col-12 text-danger">Error cargando órdenes completadas. Ver consola.</div>`;
        }
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
                        <p class="small mb-1"><i class="fas fa-envelope me-2"></i>Email: ${order.cliente?.email || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-phone me-2"></i>Teléfono: ${order.cliente?.telefono || '-'}</p>
                        <p class="small mb-1"><i class="fas fa-map-marker-alt me-2"></i>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</p>
                        <p class="small mb-1"><strong>Ubicación:</strong> ${ubicacionLink}</p>
                        <p class="small mb-1"><strong>Zona:</strong> ${order.domicilio?.zona || '-'}</p>
                        <p class="small mb-1"><strong>Plan:</strong> ${order.instalacion?.plan || '-'}</p>
                        <p class="small mb-1"><strong>Instalar:</strong> ${fechaTxt}</p>
                        <p class="small mb-1"><strong>Descripción:</strong> ${order.descripcion || '-'}</p>
                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <span class="badge bg-info text-dark">Asignado: Equipo ${order.instalacion?.equipo || '-'}</span>
                            <div class="btn-group" role="group">
                                <button class="btn btn-sm btn-outline-danger" onclick="orderManager.deleteOrder('${order.id}')"><i class="fas fa-trash-alt"></i></button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="orderManager.reprogramOrder('${order.id}')"><i class="fas fa-calendar-alt"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getMaterialesText(materiales) {
        if (!materiales) return 'N/A';
        
        const usedMaterials = this.materialesLista.filter(m => {
            const value = materiales[m.id];
            return (m.type === 'number' && value && value > 0) || (m.id === 'otros' && value && value.trim() !== '');
        });

        if (usedMaterials.length === 0) return 'Ninguno';

        return usedMaterials.map(m => {
            const value = materiales[m.id];
            if (m.type === 'number') {
                return `<strong>${m.label}</strong>: ${value}${m.unidad}`;
            } else { // Otros (texto)
                return `<strong>${m.label}</strong>: ${value}`;
            }
        }).join('<br>');
    }

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
        
        const materialesHtml = this.getMaterialesText(order.materialesGastados);
        const observacion = order.materialesGastados?.comentario || order.descripcion || '-';
        
        // Atributos de Filtrado
        const equipoData = `Equipo ${order.instalacion?.equipo || '-'}`;
        const tipoData = tipo.toLowerCase();
        
        // Atributo de fecha no se necesita para el filtro en el cliente, pero lo mantenemos por si acaso
        const fechaData = fechaCompletado ? fechaCompletado.toISOString().split('T')[0] : '';

        return `
            <tr data-equipo="${equipoData}" data-tipo-orden="${tipoData}" data-fecha="${fechaData}">
                <td>${order.cliente?.nombre || '-'}</td>
                <td>${order.cliente?.numeroCliente || '-'}</td>
                <td>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</td>
                <td>${order.domicilio?.zona || '-'}</td>
                <td>${order.instalacion?.plan || '-'}</td>
                <td>${equipoData}</td>
                <td><span class="badge ${badgeClass} px-2 py-1">${tipo}</span></td>
                <td>${materialesHtml}</td>
                <td>${observacion.replace(/\n/g, '<br>')}</td>
                <td>${order.creadoPor || '-'}</td>
                <td>${fechaTxt}</td>
            </tr>
        `;
    }

    renderCharts(docs) {
        const dynamicColors = () => {
            const r = Math.floor(Math.random() * 200) + 20;
            const g = Math.floor(Math.random() * 200) + 20;
            const b = Math.floor(Math.random() * 200) + 20;
            return `rgb(${r}, ${g}, ${b})`;
        };

        if (this.chartZona) try { this.chartZona.destroy(); } catch(e) {}
        if (this.chartPlan) try { this.chartPlan.destroy(); } catch(e) {}

        const zonaCtx = document.getElementById('chartZona').getContext('2d');
        const planCtx = document.getElementById('chartPlan').getContext('2d');

        const metrics = { porZona: {}, porPlan: {} };
        docs.forEach(order => {
            const zona = order.domicilio?.zona || 'Sin Zona';
            metrics.porZona[zona] = (metrics.porZona[zona] || 0) + 1;
            const plan = order.instalacion?.plan || 'Sin Plan';
            metrics.porPlan[plan] = (metrics.porPlan[plan] || 0) + 1;
        });

        const zonaLabels = Object.keys(metrics.porZona);
        const zonaData = Object.values(metrics.porZona);
        const zonaColors = zonaLabels.map(() => dynamicColors());

        this.chartZona = new Chart(zonaCtx, {
            type: 'pie',
            data: {
                labels: zonaLabels,
                datasets: [{ data: zonaData, backgroundColor: zonaColors, hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((sum, v) => sum + v, 0);
                                const pct = total ? ((value/total)*100).toFixed(2) : 0;
                                return `${label}: ${value} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        const planLabels = Object.keys(metrics.porPlan);
        const planData = Object.values(metrics.porPlan);
        const planColors = planLabels.map(() => dynamicColors());

        this.chartPlan = new Chart(planCtx, {
            type: 'bar',
            data: {
                labels: planLabels,
                datasets: [{
                    label: 'Órdenes por Plan',
                    data: planData,
                    backgroundColor: planColors,
                    borderColor: planColors.map(c => c.replace('rgb', 'rgba').replace(')', ', 1)')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    async deleteOrder(id) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta orden?')) return;
        try {
            await db.collection('ordenes').doc(id).delete();
            this.showSuccess('Orden eliminada');
        } catch(err) {
            console.error('Error eliminando:', err);
            alert('Error eliminando. Revisa consola.');
        }
    }

    async reprogramOrder(id) {
        try {
            const nueva = prompt('Ingresa la nueva fecha de instalación (YYYY-MM-DDTHH:MM):');
            if (!nueva) return;
            const fechaObj = new Date(nueva);
            if (isNaN(fechaObj)) {
                alert('Formato de fecha inválido.');
                return;
            }
            await db.collection('ordenes').doc(id).update({
                'instalacion.fecha': firebase.firestore.Timestamp.fromDate(fechaObj),
                estado: 'pendiente',
                fechaCompletado: firebase.firestore.FieldValue.delete(),
                materialesGastados: firebase.firestore.FieldValue.delete() 
            });
            this.showSuccess('Orden reprogramada');
        } catch(err) {
            console.error('Error reprogramando:', err);
            alert('Error reprogramando. Revisa consola.');
        }
    }

    showSuccess(msg){
        const alert = document.createElement('div');
        alert.className = 'alert alert-success alert-dismissible fade show position-fixed';
        alert.style.cssText = 'top:20px; right:20px; z-index:1050; min-width:250px';
        alert.innerHTML = `${msg} <button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(alert);
        setTimeout(()=>{ if(alert.parentNode) alert.remove(); }, 3000);
    }
    
    // --- FUNCIONES PARA FILTROS DE ÓRDENES COMPLETADAS ---
    
    /**
     * Inicializa los listeners de los filtros.
     */
    initCompletedOrdersFilterListeners() {
        const filterEquipo = document.getElementById('filterEquipo');
        const filterTipoOrden = document.getElementById('filterTipoOrden');
        const filterDateStart = document.getElementById('filterDateStart');
        const filterDateEnd = document.getElementById('filterDateEnd');
        const exportPdfBtn = document.getElementById('exportPdfBtn');

        // Los filtros de Equipo y Tipo de Orden ahora solo aplican filtros visuales (client-side)
        const clientFilterHandler = () => this.applyClientSideFilters();
        
        if (filterEquipo) filterEquipo.addEventListener('change', clientFilterHandler);
        if (filterTipoOrden) filterTipoOrden.addEventListener('change', clientFilterHandler);
        
        // Los filtros de fecha llaman a la función de carga para realizar una nueva consulta a Firebase (server-side)
        const serverFilterHandler = () => this.fetchAndRenderCompletedOrders();
        if (filterDateStart) filterDateStart.addEventListener('change', serverFilterHandler);
        if (filterDateEnd) filterDateEnd.addEventListener('change', serverFilterHandler);
        
        // LISTENER PARA EL BOTÓN DE EXPORTAR
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => this.exportCompletedOrdersToPDF());
    }

    /**
     * Aplica los filtros de Equipo y Tipo de Orden a las filas visibles de la tabla.
     * La fecha ya fue filtrada por la consulta a Firebase (Server-Side).
     */
    applyClientSideFilters() {
        const filterEquipoEl = document.getElementById('filterEquipo');
        const filterTipoOrdenEl = document.getElementById('filterTipoOrden');

        if (!filterEquipoEl || !filterTipoOrdenEl) return; 

        const selectedEquipo = filterEquipoEl.value;
        const selectedTipoOrden = filterTipoOrdenEl.value;
        
        const tableContainer = document.getElementById('completedOrdersContainer');
        if (!tableContainer) return;

        // Selecciona todas las filas de la tabla cargada
        const orderRows = tableContainer.querySelectorAll('tbody tr[data-equipo]'); 

        orderRows.forEach(row => {
            const rowEquipo = row.getAttribute('data-equipo');
            const rowTipoOrden = row.getAttribute('data-tipo-orden');
            
            // FILTRO 1: Equipo
            const matchEquipo = selectedEquipo === 'todos' || rowEquipo === selectedEquipo;
            
            // FILTRO 2: Tipo de Orden
            const matchTipoOrden = selectedTipoOrden === 'todos' || rowTipoOrden === selectedTipoOrden;

            // Mostrar u ocultar la fila
            if (matchEquipo && matchTipoOrden) {
                row.style.display = ''; // Mostrar
            } else {
                row.style.display = 'none'; // Ocultar
            }
        });
    }
    
    /**
     * Exporta la tabla de órdenes completadas (solo las filas visibles/filtradas) a un archivo PDF.
     */
    exportCompletedOrdersToPDF() {
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            alert('Error: La librería jsPDF no está cargada correctamente. Asegúrate de que las etiquetas <script> estén en index.html');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // 'l' para horizontal, A4

        const table = document.getElementById('completedOrdersTable');
        if (!table) {
            alert('Error: No se encontró la tabla de órdenes completadas. Primero cargue los datos.');
            return;
        }
        
        // 1. Obtener los datos visibles (filtrados)
        const head = [];
        const body = [];
        
        // Obtener encabezados
        const headers = table.querySelectorAll('thead th');
        headers.forEach(th => head.push(th.textContent.trim()));

        // Obtener filas visibles
        const visibleRows = table.querySelectorAll('tbody tr');
        visibleRows.forEach(row => {
            // Solo procesar filas que están visibles (no tienen display: none)
            if (row.style.display !== 'none') {
                const rowData = [];
                row.querySelectorAll('td').forEach((td, index) => {
                    let textContent = td.textContent.trim();
                    // Para la columna "Tipo" (índice 6), usar el texto plano del badge
                    if (index === 6) { 
                        const badge = td.querySelector('.badge');
                        textContent = badge ? badge.textContent.trim() : textContent;
                    }
                    // Para la columna de Materiales (índice 7), reemplazar <br> por salto de línea o coma
                    if (index === 7) { 
                         textContent = td.innerHTML.replace(/<br>/g, ', ').replace(/<\/?strong>/g, '');
                    }
                    // Para la columna de Observación (índice 8), reemplazar <br> por salto de línea
                    if (index === 8) {
                         textContent = td.innerHTML.replace(/<br>/g, ' - ').replace(/<\/?strong>/g, '');
                    }
                    
                    // Limitar el tamaño de la observación para que no desborde (opcional)
                    if (index === 8 && textContent.length > 50) { 
                        textContent = textContent.substring(0, 50) + '...';
                    }
                    
                    rowData.push(textContent);
                });
                body.push(rowData);
            }
        });

        // 2. Encabezado del PDF
        const filterEquipo = document.getElementById('filterEquipo')?.value;
        const filterTipoOrden = document.getElementById('filterTipoOrden')?.value;
        const filterDateStart = document.getElementById('filterDateStart')?.value;
        const filterDateEnd = document.getElementById('filterDateEnd')?.value;

        const dateRangeText = (filterDateStart || filterDateEnd) 
            ? `Rango: ${filterDateStart || 'Inicio'} al ${filterDateEnd || 'Fin'}`
            : 'Últimas 200 órdenes (sin filtro de fecha)';
            
        doc.setFontSize(16);
        doc.text("Reporte de Órdenes Completadas", 148.5, 15, null, null, 'center'); 
        
        doc.setFontSize(10);
        doc.text(`Filtros Aplicados: Equipo: ${filterEquipo}, Tipo: ${filterTipoOrden}, Fecha: ${dateRangeText}`, 148.5, 22, null, null, 'center');

        // 3. Configuración y generación de la tabla
        doc.autoTable({
            head: [head],
            body: body,
            startY: 28, 
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
            headStyles: { fillColor: [52, 58, 64], textColor: 255, fontStyle: 'bold' }, // table-dark
            columnStyles: {
                // Ajustar ancho de columnas para A4 horizontal
                0: { cellWidth: 30 }, // Cliente
                1: { cellWidth: 18 }, // N° Cliente
                2: { cellWidth: 40 }, // Dirección
                3: { cellWidth: 20 }, // Zona
                4: { cellWidth: 20 }, // Plan
                5: { cellWidth: 20 }, // Equipo
                6: { cellWidth: 20 }, // Tipo
                7: { cellWidth: 40 }, // Materiales
                8: { cellWidth: 40 }, // Observación
                9: { cellWidth: 20 }, // Creado por
                10: { cellWidth: 25 } // Fecha Completado
            }
        });

        const numOrders = body.length;
        doc.text(`Total de Órdenes en el reporte: ${numOrders}`, 14, doc.internal.pageSize.height - 10);
        
        // 4. Guardar el PDF
        const fileName = `Reporte_Ordenes_Completadas_${filterDateStart || 'Inicio'}_a_${filterDateEnd || 'Fin'}.pdf`;
        doc.save(fileName);
        this.showSuccess(`¡${numOrders} órdenes exportadas a PDF con éxito!`);
    }
}

window.addEventListener('DOMContentLoaded', ()=>{
    window.orderManager = new OrderManager();
});




