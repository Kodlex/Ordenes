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
        this.unsubscribeCompleted = null;
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
        // NUEVO: Escuchar el evento de envío del formulario de filtros de materiales
        document.getElementById('materialFilterForm')?.addEventListener('submit', (e) => this.handleMaterialFilterSubmit(e));

        const navTabs = document.getElementById('myTab');
        if (navTabs) {
            navTabs.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('data-bs-target').substring(1);
                this.unloadListeners();
                if (targetId === 'orders') {
                    this.loadPendingRealtime();
                } else if (targetId === 'completed') {
                    this.loadCompletedRealtime();
                // NUEVO: Cargar setup al cambiar a la pestaña de materiales
                } else if (targetId === 'materials') {
                    this.setupMaterialTab();
                }
            });
        }

        const activeTab = document.querySelector('.nav-link.active');
        const activeTabId = activeTab ? activeTab.getAttribute('data-bs-target').substring(1) : 'form';
        if (activeTabId === 'orders') {
            this.loadPendingRealtime();
        } else if (activeTabId === 'completed') {
            this.loadCompletedRealtime();
        // NUEVO: Cargar setup al inicio si la pestaña es la de materiales
        } else if (activeTabId === 'materials') {
            this.setupMaterialTab();
        }
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
        if (this.unsubscribeCompleted) {
            this.unsubscribeCompleted();
            this.unsubscribeCompleted = null;
        }
        if (this.chartZona) {
            try { this.chartZona.destroy(); } catch(e) {}
            this.chartZona = null;
        }
        if (this.chartPlan) {
            try { this.chartPlan.destroy(); } catch(e) {}
            this.chartPlan = null;
        }
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

    loadCompletedRealtime(){
        const container = document.getElementById('completedOrdersContainer');
        const chartZonaEl = document.getElementById('chartZona');
        const chartPlanEl = document.getElementById('chartPlan');
        if (!container || !chartZonaEl || !chartPlanEl) return;

        this.unloadListeners();
        const q = db.collection('ordenes').where('estado', '==', 'completado');
        this.unsubscribeCompleted = q.onSnapshot(snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // ordenar por fechaCompletado desc
            docs.sort((a,b) => {
                const da = toDate(a.fechaCompletado) || toDate(a.instalacion?.fecha) || new Date(0);
                const db_ = toDate(b.fechaCompletado) || toDate(b.instalacion?.fecha) || new Date(0);
                return db_ - da;
            });

            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No hay órdenes completadas</h5></div>`;
                chartZonaEl.style.display = 'none';
                chartPlanEl.style.display = 'none';
                return;
            }

            chartZonaEl.style.display = 'block';
            chartPlanEl.style.display = 'block';

            // métricas
            const metrics = { porZona: {}, porPlan: {} };
            docs.forEach(order => {
                const zona = order.domicilio?.zona || 'Sin Zona';
                metrics.porZona[zona] = (metrics.porZona[zona] || 0) + 1;
                const plan = order.instalacion?.plan || 'Sin Plan';
                metrics.porPlan[plan] = (metrics.porPlan[plan] || 0) + 1;
            });

            // charts
            this.renderCharts(metrics);

            // tabla
            const tableHtml = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
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

        }, err => {
            console.error('Error listener completadas:', err);
            container.innerHTML = `<div class="col-12 text-danger">Error cargando órdenes completadas. Ver consola.</div>`;
        });
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

        return `
            <tr>
                <td>${order.cliente?.nombre || '-'}</td>
                <td>${order.cliente?.numeroCliente || '-'}</td>
                <td>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</td>
                <td>${order.domicilio?.zona || '-'}</td>
                <td>${order.instalacion?.plan || '-'}</td>
                <td>Equipo ${order.instalacion?.equipo || '-'}</td>
                <td><span class="badge ${badgeClass} px-2 py-1">${tipo}</span></td>
                <td>${materialesHtml}</td>
                <td>${observacion.replace(/\n/g, '<br>')}</td>
                <td>${order.creadoPor || '-'}</td>
                <td>${fechaTxt}</td>
            </tr>
        `;
    }

    renderCharts(metrics) {
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
                materialesGastados: firebase.firestore.FieldValue.delete() // Opcional: borrar materiales al reprogramar
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
    
    // --- NUEVAS FUNCIONES PARA EL REPORTE DE MATERIALES ---
    
    // Prepara la pestaña de materiales (establece el mes actual por defecto)
    setupMaterialTab() {
        const filterMonth = document.getElementById('filterMonth');
        if (!filterMonth.value) {
            const now = new Date();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            filterMonth.value = `${year}-${month}`;
        }
    }

    // Maneja el envío del formulario de filtros de materiales
    async handleMaterialFilterSubmit(e) {
        e.preventDefault();
        const form = e.target;
        form.classList.add('was-validated');
        if (!form.checkValidity()) return;

        const container = document.getElementById('materialSummaryContainer');
        const monthInput = document.getElementById('filterMonth').value;
        const equipo = document.getElementById('filterEquipo').value;

        const [year, month] = monthInput.split('-');
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        
        container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-spinner fa-spin fa-3x mb-3"></i><h5>Cargando órdenes...</h5></div>`;

        try {
            let q = db.collection('ordenes')
                .where('estado', '==', 'completado')
                // Se filtra por fechaCompletado, que contiene el registro de materiales
                .where('fechaCompletado', '>=', firebase.firestore.Timestamp.fromDate(startDate))
                .where('fechaCompletado', '<', firebase.firestore.Timestamp.fromDate(endDate))
                .orderBy('fechaCompletado', 'desc');

            const snapshot = await q.get();
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            this.processMaterialData(docs, equipo, container);

        } catch (err) {
            console.error('Error cargando datos de materiales:', err);
            container.innerHTML = `<div class="col-12 text-danger text-center py-5">Error cargando datos. Revisa consola.</div>`;
        }
    }

    // Procesa y muestra los datos de materiales
    processMaterialData(docs, filterEquipo, container) {
        let filteredDocs = docs;
        if (filterEquipo) {
            // Aplica el filtro por equipo
            filteredDocs = docs.filter(doc => doc.instalacion?.equipo === filterEquipo);
        }

        if (filteredDocs.length === 0) {
            container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-box-open fa-3x mb-3"></i><h5>No se encontraron órdenes completadas con esos filtros.</h5></div>`;
            return;
        }

        const materialSummary = {};
        
        // 1. Inicializar el resumen con 0 para todos los materiales numéricos
        this.materialesLista.filter(m => m.type === 'number').forEach(m => {
            materialSummary[m.id] = { label: m.label, unidad: m.unidad, total: 0 };
        });

        const observacionesOtros = [];

        // 2. Sumar materiales y recolectar observaciones
        filteredDocs.forEach(order => {
            const materiales = order.materialesGastados;
            if (materiales) {
                // Sumar materiales numéricos
                this.materialesLista.filter(m => m.type === 'number').forEach(m => {
                    const value = parseFloat(materiales[m.id]) || 0;
                    if (value > 0) {
                        materialSummary[m.id].total += value;
                    }
                });
                
                // Recolectar observaciones 'otros' y comentarios generales
                const otrosMateriales = materiales.otros;
                const comentario = materiales.comentario;
                
                if (otrosMateriales && typeof otrosMateriales === 'string' && otrosMateriales.trim() !== '') {
                    observacionesOtros.push({
                        ordenId: order.id.substr(-6), 
                        equipo: order.instalacion?.equipo,
                        cliente: order.cliente?.nombre,
                        observacion: `(OTROS): ${otrosMateriales}${comentario && comentario.trim() !== '' ? ` - ${comentario}` : ''}`
                    });
                } else if (comentario && comentario.trim() !== '') {
                    observacionesOtros.push({
                        ordenId: order.id.substr(-6),
                        equipo: order.instalacion?.equipo,
                        cliente: order.cliente?.nombre,
                        observacion: `(COMENTARIO GENERAL): ${comentario}`
                    });
                }
            }
        });

        // 3. Crear el HTML de las tablas
        const summaryRows = Object.values(materialSummary)
            .filter(m => m.total > 0) // Solo mostrar materiales con un total gastado
            .map(m => `
                <tr>
                    <td><strong>${m.label}</strong></td>
                    <td class="text-end">${m.total.toFixed(2).replace(/\.00$/, '')}</td>
                    <td>${m.unidad}</td>
                </tr>
            `).join('');

        const summaryTable = `
            <div class="row">
                <div class="col-lg-6 mb-4">
                    <div class="card h-100">
                        <div class="card-header bg-primary text-white">
                            <h6 class="mb-0">Resumen de Materiales Gastados</h6>
                            <p class="small mb-0">Total: ${filteredDocs.length} órdenes completadas en el período${filterEquipo ? ` por Equipo ${filterEquipo}` : ''}.</p>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-bordered table-striped">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Material</th>
                                            <th class="text-end">Cantidad Total</th>
                                            <th>Unidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${summaryRows.length > 0 ? summaryRows : '<tr><td colspan="3" class="text-center text-muted">No se registraron materiales numéricos en las órdenes filtradas.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6 mb-4">
                    ${this.createOtrosTable(observacionesOtros)}
                </div>
            </div>
        `;
        container.innerHTML = summaryTable;
    }

    // Crea la tabla de observaciones "Otros"
    createOtrosTable(observacionesOtros) {
        if (observacionesOtros.length === 0) {
            return `
                <div class="card h-100">
                    <div class="card-header bg-info text-white">
                        <h6 class="mb-0">Detalle de Materiales "Otros" / Observaciones</h6>
                    </div>
                    <div class="card-body d-flex align-items-center justify-content-center">
                        <p class="text-center text-muted m-0">No se registraron detalles de "Otros" o comentarios generales en este período.</p>
                    </div>
                </div>
            `;
        }
        
        const rows = observacionesOtros.map(o => `
            <tr>
                <td>#${o.ordenId}</td>
                <td>Equipo ${o.equipo || '-'}</td>
                <td>${o.cliente || '-'}</td>
                <td>${o.observacion}</td>
            </tr>
        `).join('');

        return `
            <div class="card h-100">
                <div class="card-header bg-info text-white">
                    <h6 class="mb-0">Detalle de Materiales "Otros" / Observaciones (${observacionesOtros.length} registros)</h6>
                </div>
                <div class="card-body">
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-sm table-striped table-hover small">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th>Orden</th>
                                    <th>Equipo</th>
                                    <th>Cliente</th>
                                    <th>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}

window.addEventListener('DOMContentLoaded', ()=>{
    window.orderManager = new OrderManager();
});



