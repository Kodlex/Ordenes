// Asegúrate de que firebase y db estén inicializados en script_firebase.js (debe estar incluido)

class StockManager {
    constructor(){
        this.unsubscribeStockGeneral = null;
        this.unsubscribeStockEquipos = [];
        this.unsubscribeStockMovements = null; // NUEVO: Listener para movimientos
        this.stockGeneralData = {};
        this.stockEquiposAllData = {}; // NUEVO: Almacena todo el stock de equipos para validación
        this.TEAMS = ['1', '2', '3', '4', '5'];
        this.managerUser = null; // Se inicializa en checkLogin
        
        // Lista de materiales con NUEVA propiedad minStock (Umbral de Alerta)
        this.stockMateriales = [
            { id: 'drop', label: 'Drop', unidad: 'm', type: 'number', minStock: 500 }, // Ejemplo: 500m de drop como mínimo
            { id: 'conectorFTTH', label: 'Conector FTTH', unidad: 'u', type: 'number', minStock: 30 },
            { id: 'coaxial', label: 'Coaxial', unidad: 'm', type: 'number', minStock: 300 },
            { id: 'conectorRG6', label: 'Conector RG6', unidad: 'u', type: 'number', minStock: 20 },
            { id: 'grampas', label: 'Grampas', unidad: 'u', type: 'number', minStock: 500 },
            { id: 'splitter', label: 'Splitter', unidad: 'u', type: 'number', minStock: 10 },
            { id: 'conectorRJ45', label: 'Conector RJ45', unidad: 'u', type: 'number', minStock: 50 },
            { id: 'fuente', label: 'Fuente', unidad: 'u', type: 'number', minStock: 5 },
            { id: 'router', label: 'Router', unidad: 'u', type: 'number', minStock: 5 },
            { id: 'patchCord', label: 'Patch Cord', unidad: 'u', type: 'number', minStock: 15 },
            { id: 'observacionMaterial', label: 'Observación Material (Texto)', type: 'text' },
        ];
        
        this.checkLogin();
        this.init();
    }

    checkLogin() {
        const user = localStorage.getItem('userName');
        const userType = localStorage.getItem('userType');
        if (!user || userType !== 'admin') {
            window.location.href = 'login_admin.html'; // Redirige si no está logeado como admin
            return;
        }
        document.getElementById('userDisplay').textContent = `Stock: ${user}`;
        this.managerUser = user; // Almacena el nombre del usuario logeado para la trazabilidad
    }

    logout() {
        localStorage.removeItem('userName');
        localStorage.removeItem('userType');
        window.location.href = 'login_admin.html';
    }

    init() {
        document.getElementById('logoutBtn').addEventListener('click', this.logout);
        document.getElementById('formIngresoStock')?.addEventListener('submit', (e) => this.handleIngresoStock(e));
        document.getElementById('formAsignarMaterial')?.addEventListener('submit', (e) => this.handleAsignarMaterial(e));
        
        // --- INICIO: NUEVOS LISTENERS PARA AJUSTE/RE-ASIGNACIÓN ---
        document.getElementById('formAjusteStock')?.addEventListener('submit', (e) => this.handleAjusteStock(e));
        document.getElementById('tipoAjuste')?.addEventListener('change', () => this.toggleAjusteInputs());
        // --- FIN: NUEVOS LISTENERS ---
        
        // --- LISTENERS PARA FILTROS ---
        document.getElementById('filtroStockGeneral')?.addEventListener('input', () => this.applyStockGeneralFilters());
        document.getElementById('filtroAlertaStock')?.addEventListener('change', () => this.applyStockGeneralFilters());
        document.getElementById('filtroAsignacionEquipos')?.addEventListener('input', () => this.applyAsignacionEquiposFilter());
        
        // --- NUEVOS LISTENERS PARA REPORTE DE MATERIALES CONSUMIDOS ---
        document.getElementById('formUsedMaterialsFilter')?.addEventListener('submit', (e) => this.handleUsedMaterialsFilter(e));
        // --- FIN LISTENERS ---

        this.generateStockModalInputs();
        this.generateAjusteModalInputs(); // <-- LLAMADA A FUNCIÓN NUEVA
        this.loadStockGeneralRealtime();
        this.loadAsignacionEquiposRealtime();
        this.loadStockMovementsRealtime(); // NUEVO: Carga la trazabilidad
        
        // Establecer fechas por defecto para el reporte (Ej: Últimos 30 días)
        this.setDefaultReportDates();
    }

    // =================================================================
    // =========== LÓGICA DE TRAZABILIDAD (MOVIMIENTOS) ================
    // =================================================================

    loadStockMovementsRealtime() {
        if (this.unsubscribeStockMovements) this.unsubscribeStockMovements();

        this.unsubscribeStockMovements = db.collection('stock_movements')
            .orderBy('timestamp', 'desc')
            .limit(10) // Mostrar solo los últimos 10 movimientos
            .onSnapshot(snapshot => {
                const movements = snapshot.docs.map(doc => doc.data());
                this.renderStockMovements(movements);
            }, err => {
                console.error("Error al obtener movimientos de stock:", err);
            });
    }

    renderStockMovements(movements) {
        const container = document.getElementById('stockMovementsContainer');
        if (!container) return;

        if (movements.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">No se han registrado movimientos recientes.</div>`;
            return;
        }

        const rows = movements.map(m => {
            // Convierte el timestamp de Firebase a objeto Date
            const date = m.timestamp.toDate ? m.timestamp.toDate() : new Date(); 
            const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            
            const isEntry = m.type === 'ENTRADA';
            const isAdjust = m.type.includes('AJUSTE');
            const isAssign = m.type === 'ASIGNACION';
            const isDevolucion = m.type === 'Devolución (Eq General)';

            let icon = 'fas fa-arrow-circle-right text-info';
            let colorClass = '';
            
            if (isEntry || isDevolucion || m.type.includes('(+)')) {
                icon = 'fas fa-arrow-circle-up text-success';
            } else if (isAssign || m.type.includes('(-)') || m.type.includes('ASIGNACION')) {
                icon = 'fas fa-arrow-circle-down text-danger';
            } else if (m.type.includes('Re-asignación')) {
                 icon = 'fas fa-exchange-alt text-warning';
                 colorClass = 'text-warning';
            }
            
            // Si el campo 'notes' ya tiene el signo y la cantidad, solo se muestra el resto de la nota.
            const noteText = m.notes;
            const teamInfo = m.teamId && m.type !== 'ENTRADA' && !m.type.includes('General') ? `(Equipo ${m.teamId})` : '';


            return `
                <li class="list-group-item p-2 d-flex justify-content-between align-items-start ${colorClass}">
                    <div>
                        <i class="${icon} me-2"></i> 
                        <strong>${m.materialLabel}</strong>: ${m.type.replace('General', '').replace('(+)', '').replace('(-)', '')} ${teamInfo}
                        <div class="text-muted small">
                            ${noteText}
                        </div>
                    </div>
                    <small class="text-end text-muted mt-1">
                        ${dateStr} ${timeStr}<br>
                        ${m.manager}
                    </small>
                </li>
            `;
        }).join('');

        container.innerHTML = `<ul class="list-group list-group-flush small">${rows}</ul>`;
    }

    async registerStockMovement(type, materialId, quantity, notes, teamId = null) {
        // Busca el label y unidad del material
        const materialDetails = this.stockMateriales.find(m => m.id === materialId);
        
        if (!materialDetails) {
            console.error(`Error: No se encontró el material con ID ${materialId}`);
            return;
        }
        
        // Define el signo para la nota
        const sign = type === 'ENTRADA' ? '+' : (type === 'ASIGNACION' ? '-' : '');
        
        const movementData = {
            type: type, // 'ENTRADA' o 'ASIGNACION'
            materialId: materialId,
            materialLabel: materialDetails.label,
            unidad: materialDetails.unidad,
            quantity: quantity,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            manager: this.managerUser || 'Admin_Desconocido', // Usuario logeado
            notes: `${sign} ${quantity.toFixed(0)} ${materialDetails.unidad}. ${notes}`, // Nuevo formato de notas para trazabilidad
            teamId: teamId
        };
        
        try {
            await db.collection('stock_movements').add(movementData);
        } catch (err) {
            console.error('Error al registrar el movimiento de stock:', err);
        }
    }


    // =================================================================
    // =========== LÓGICA DE FILTRO Y REPORTE DE CONSUMO ===============
    // =================================================================
    
    // ... (El código de los reportes es el mismo)
    
    setDefaultReportDates() {
        const endDateInput = document.getElementById('endDateFilterUsed');
        const startDateInput = document.getElementById('startDateFilterUsed');
        if (endDateInput && startDateInput) {
            const today = new Date();
            const last30Days = new Date();
            last30Days.setDate(today.getDate() - 30);
            
            const formatDate = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            endDateInput.value = formatDate(today);
            startDateInput.value = formatDate(last30Days);
        }
    }
    
    handleUsedMaterialsFilter(e) {
        e.preventDefault();
        const form = document.getElementById('formUsedMaterialsFilter');
        form.classList.add('was-validated'); 
        if (!form.checkValidity()) {
            return;
        }

        const equipoId = document.getElementById('equipoFilterUsed').value;
        const startDateStr = document.getElementById('startDateFilterUsed').value;
        const endDateStr = document.getElementById('endDateFilterUsed').value;

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999); 
        
        this.loadUsedMaterialsReport(equipoId, startDate, endDate);
    }
    
    async loadUsedMaterialsReport(equipoId, startDate, endDate) {
        const container = document.getElementById('usedMaterialsContainer');
        container.innerHTML = `<div class="text-center text-muted py-5">
                                <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
                                <h6>Cargando reporte para Equipo ${equipoId}...</h6>
                               </div>`;

        try {
            const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
            const endTimestamp = firebase.firestore.Timestamp.fromDate(endDate);
            
            const q = db.collection('ordenes')
                .where('estado', '==', 'completado')
                .where('instalacion.equipo', '==', equipoId)
                .where('fechaCompletado', '>=', startTimestamp)
                .where('fechaCompletado', '<=', endTimestamp)
                .orderBy('fechaCompletado', 'desc');

            const snapshot = await q.get();
            const completedOrders = snapshot.docs.map(doc => doc.data());

            const aggregation = {};
            let totalOrders = 0;

            completedOrders.forEach(order => {
                const materiales = order.materialesGastados || {};
                totalOrders++;
                
                this.stockMateriales.forEach(m => {
                    if (m.type === 'number') {
                        const consumed = parseInt(materiales[m.id] || 0);
                        if (consumed > 0) {
                            aggregation[m.id] = (aggregation[m.id] || 0) + consumed;
                        }
                    } 
                });
            });

            this.renderUsedMaterialsReport(aggregation, equipoId, startDate, endDate, totalOrders);

        } catch (err) {
            console.error('Error cargando el reporte de materiales consumidos:', err);
            container.innerHTML = `<div class="text-danger p-3 text-center">
                                     <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar el reporte. Revisa la consola.
                                   </div>`;
        }
    }

    renderUsedMaterialsReport(aggregation, equipoId, startDate, endDate, totalOrders) {
        const container = document.getElementById('usedMaterialsContainer');
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        const startTxt = startDate.toLocaleDateString('es-ES', options);
        const endTxt = endDate.toLocaleDateString('es-ES', options);
        
        const aggregatedMaterials = this.stockMateriales
            .filter(m => m.type === 'number')
            .map(m => ({
                label: m.label,
                unidad: m.unidad,
                total: aggregation[m.id] || 0
            }))
            .filter(m => m.total > 0);

        if (totalOrders === 0) {
            container.innerHTML = `<div class="text-muted p-3 text-center">
                                     <h6>No se encontraron órdenes completadas por el Equipo ${equipoId} en el periodo seleccionado.</h6>
                                   </div>`;
            return;
        }

        if (aggregatedMaterials.length === 0) {
            container.innerHTML = `<div class="text-muted p-3 text-center">
                                     <h6>✅ Equipo ${equipoId} no consumió materiales contables entre ${startTxt} y ${endTxt} en **${totalOrders}** órdenes.</h6>
                                   </div>`;
            return;
        }

        const rows = aggregatedMaterials.map(m => `
            <tr>
                <td><strong>${m.label}</strong></td>
                <td class="text-end">${m.total.toFixed(0)}</td>
                <td>${m.unidad}</td>
            </tr>
        `).join('');

        const tableHtml = `
            <p class="small text-muted mb-2 text-center">
                Reporte para **Equipo ${equipoId}** | Órdenes Completadas: **${totalOrders}** <br>
                Periodo: ${startTxt} - ${endTxt}
            </p>
            <div class="table-responsive">
                <table class="table table-striped table-hover table-sm small">
                    <thead class="table-danger">
                        <tr>
                            <th>Material</th>
                            <th class="text-end">Cantidad Usada</th>
                            <th>Unidad</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = tableHtml;
    }


    // =================================================================
    // =========== LÓGICA DE STOCK GENERAL (ALERTA) ====================
    // =================================================================

    loadStockGeneralRealtime() {
        if (this.unsubscribeStockGeneral) this.unsubscribeStockGeneral();

        this.unsubscribeStockGeneral = db.collection('stockGeneral').doc('general')
            .onSnapshot(doc => {
                if (doc.exists) {
                    this.stockGeneralData = doc.data() || {};
                    this.renderStockGeneral();
                    const sampleMinStock = this.stockMateriales.find(m => m.id === 'conectorFTTH')?.minStock || 30;
                    document.getElementById('minStockDisplay').textContent = `${sampleMinStock} u`;
                } else {
                    this.stockGeneralData = {};
                    this.renderStockGeneral();
                    console.log("Documento de stock general no encontrado. Creando uno vacío.");
                    db.collection('stockGeneral').doc('general').set({});
                }
            }, err => {
                console.error("Error al obtener stock general:", err);
            });
    }

    renderStockGeneral() {
        let filtroTexto = document.getElementById('filtroStockGeneral')?.value.toLowerCase() || '';
        let filtroAlerta = document.getElementById('filtroAlertaStock')?.value || 'todos';

        const tableBody = document.getElementById('stockGeneralContainer');
        let html = '';
        
        const filteredMaterials = this.stockMateriales.filter(m => m.type === 'number').filter(m => {
            const label = m.label.toLowerCase();
            const stock = this.stockGeneralData[m.id] || 0;
            const minStock = m.minStock || 50; 
            const isInAlert = stock < minStock; 

            const matchesText = label.includes(filtroTexto);
            const matchesAlert = filtroAlerta === 'todos' || (filtroAlerta === 'alerta' && isInAlert);

            return matchesText && matchesAlert;
        });

        if (filteredMaterials.length > 0) {
            const rows = filteredMaterials.map(m => {
                const stock = this.stockGeneralData[m.id] || 0;
                const minStock = m.minStock || 50; 
                const isWarning = stock < minStock && stock > 0;
                const isCritical = stock <= 0;
                
                let rowClass = '';
                let estadoText = 'Normal';
                if (isCritical) {
                    rowClass = 'table-danger fw-bold';
                    estadoText = '<i class="fas fa-exclamation-circle me-1"></i> CRÍTICO';
                } else if (isWarning) {
                    rowClass = 'table-warning fw-bold';
                    estadoText = `<i class="fas fa-exclamation-triangle me-1"></i> Alerta (${minStock} ${m.unidad})`;
                }

                return `
                    <tr class="${rowClass}">
                        <td>${m.label}</td>
                        <td class="text-end">${stock.toFixed(0)}</td>
                        <td>${m.unidad}</td>
                        <td>${estadoText}</td>
                    </tr>
                `;
            }).join('');

            html = `
                <div class="table-responsive">
                    <table class="table table-striped table-hover table-sm small">
                        <thead class="table-success sticky-top">
                            <tr>
                                <th>Material</th>
                                <th class="text-end">Stock</th>
                                <th>Unidad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            html = `<div class="text-center text-muted py-5">
                        <h6>${filtroAlerta === 'alerta' ? 'No hay materiales en alerta.' : 'No se encontraron materiales.'}</h6>
                    </div>`;
        }
        
        if(tableBody) tableBody.innerHTML = html;
    }

    applyStockGeneralFilters() {
        this.renderStockGeneral();
    }

    async handleIngresoStock(e) {
        e.preventDefault();
        const form = document.getElementById('formIngresoStock');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        const supplierNotes = document.getElementById('supplierOrNotes').value.trim();

        const updates = {};
        const movements = [];
        let hasUpdates = false;

        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`ingreso_${m.id}`);
            const amount = parseInt(input.value) || 0;
            if (amount > 0) {
                updates[m.id] = firebase.firestore.FieldValue.increment(amount);
                movements.push({ materialId: m.id, quantity: amount, notes: supplierNotes });
                hasUpdates = true;
            }
        });

        if (!hasUpdates) {
            this.showSuccess('No se ingresó ninguna cantidad positiva.');
            return;
        }

        const stockGeneralRef = db.collection('stockGeneral').doc('general');

        try {
            const batch = db.batch();
            batch.set(stockGeneralRef, updates, { merge: true });
            
            await batch.commit();

            for (const mov of movements) {
                await this.registerStockMovement('ENTRADA', mov.materialId, mov.quantity, mov.notes);
            }
            
            this.showSuccess('Stock ingresado y registrado con éxito.', 'Ingreso Completado');
            form.reset();
            form.classList.remove('was-validated');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalIngresoStock'));
            modal.hide();
        } catch (err) {
            console.error('Error al ingresar stock:', err);
            this.showError('Error al ingresar stock. Revisa la consola.', 'Fallo en la Operación');
        }
    }

    // =================================================================
    // =========== LÓGICA DE STOCK POR EQUIPO (CORRECCIÓN) =============
    // =================================================================
    
    loadAsignacionEquiposRealtime() {
        const container = document.getElementById('asignacionEquiposContainer');
        
        if (container) {
            if (container.children.length === 1 && container.children[0].textContent.includes('Cargando stock de equipos')) {
                 container.innerHTML = '';
            }
        }

        this.unsubscribeStockEquipos.forEach(unsub => unsub());
        this.unsubscribeStockEquipos = [];
        this.stockEquiposAllData = {}; // Reset data before loading

        this.TEAMS.forEach(equipoId => {
            const unsub = db.collection('stockEquipos').doc(`equipo_${equipoId}`)
                .onSnapshot(doc => {
                    const data = doc.data() || {};
                    this.stockEquiposAllData[equipoId] = data; // ACTUALIZA DATA CENTRAL
                    this.renderStockEquipo(equipoId, data);
                    this.applyAsignacionEquiposFilter();
                }, err => {
                    console.error(`Error al obtener stock de Equipo ${equipoId}:`, err);
                });
            this.unsubscribeStockEquipos.push(unsub);
        });
    }
    
    // ... (El resto de funciones de asignación son las mismas)
    
    renderStockEquipo(equipoId, data) {
        const container = document.getElementById('asignacionEquiposContainer');
        let equipoCard = document.getElementById(`equipoCard_${equipoId}`);

        if (!container) return;

        if (!equipoCard) {
            equipoCard = document.createElement('div');
            equipoCard.id = `equipoCard_${equipoId}`;
            equipoCard.classList.add('accordion-item', 'mb-2');
            container.appendChild(equipoCard);
        }

        const itemsHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => {
            const stock = data[m.id] || 0;
            const minStock = m.minStock || 10;
            const isLow = stock < minStock;
            return `
                <li class="list-group-item d-flex justify-content-between align-items-center p-1 small" data-material="${m.label.toLowerCase()}">
                    ${m.label}
                    <span class="badge ${isLow ? 'bg-danger' : 'bg-primary'} rounded-pill">${stock.toFixed(0)} ${m.unidad}</span>
                </li>
            `;
        }).join('');

        equipoCard.innerHTML = `
            <h2 class="accordion-header" id="headingEquipo${equipoId}">
                <button class="accordion-button collapsed bg-purple text-white p-2" type="button" data-bs-toggle="collapse" data-bs-target="#collapseEquipo${equipoId}" aria-expanded="false" aria-controls="collapseEquipo${equipoId}">
                    <i class="fas fa-tools me-2"></i> **Equipo ${equipoId}**
                </button>
            </h2>
            <div id="collapseEquipo${equipoId}" class="accordion-collapse collapse" aria-labelledby="headingEquipo${equipoId}">
                <div class="accordion-body p-0">
                    <ul class="list-group list-group-flush small" id="listGroupEquipo${equipoId}">
                        ${itemsHTML}
                    </ul>
                </div>
            </div>
        `;
    }

    applyAsignacionEquiposFilter() {
        const filterText = document.getElementById('filtroAsignacionEquipos')?.value.toLowerCase() || '';
        
        this.TEAMS.forEach(equipoId => {
            const card = document.getElementById(`equipoCard_${equipoId}`);
            if (!card) return;

            const listGroup = document.getElementById(`listGroupEquipo${equipoId}`);
            let hasVisibleMaterial = false;

            if (listGroup) {
                const materials = listGroup.querySelectorAll('li');
                materials.forEach(li => {
                    const materialName = li.getAttribute('data-material');
                    const isVisible = materialName.includes(filterText);
                    li.style.display = isVisible ? '' : 'none';
                    if (isVisible) {
                        hasVisibleMaterial = true;
                    }
                });
            }

            const teamNameMatch = `equipo ${equipoId}`.includes(filterText);

            if (teamNameMatch || hasVisibleMaterial || filterText === '') {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }

    generateStockModalInputs() {
        const inputContainerIngreso = document.getElementById('ingresoStockInputs');
        const inputContainerAsignar = document.getElementById('asignarMaterialInputs');

        const inputsHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => `
            <div class="mb-3">
                <label for="ingreso_${m.id}" class="form-label">${m.label} (${m.unidad})</label>
                <input type="number" class="form-control" id="ingreso_${m.id}" name="${m.id}" min="0" value="0">
                <div class="invalid-feedback">Debe ser un número positivo.</div>
            </div>
        `).join('');
        
        const asignarHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => `
            <div class="mb-3">
                <label for="asignar_${m.id}" class="form-label">${m.label} (${m.unidad})</label>
                <input type="number" class="form-control" id="asignar_${m.id}" name="${m.id}" min="0" value="0">
                <div class="invalid-feedback" id="feedback_asignar_${m.id}">Debe ser un número positivo.</div>
            </div>
        `).join('');


        if(inputContainerIngreso) inputContainerIngreso.innerHTML = inputsHTML;
        if(inputContainerAsignar) inputContainerAsignar.innerHTML = asignarHTML;
    }

    // INICIO: NUEVAS FUNCIONES PARA AJUSTE/RE-ASIGNACIÓN

    // Genera inputs específicos para el modal de ajuste (permite negativos)
    generateAjusteModalInputs() {
        const inputContainerAjuste = document.getElementById('ajusteStockInputs');
        
        const ajusteHTML = this.stockMateriales.filter(m => m.type === 'number').map(m => `
            <div class="mb-3">
                <label for="ajuste_${m.id}" class="form-label">${m.label} (${m.unidad})</label>
                <input type="number" class="form-control" id="ajuste_${m.id}" name="${m.id}" value="0"> 
                <div class="invalid-feedback" id="feedback_ajuste_${m.id}">Ingresa una cantidad.</div>
            </div>
        `).join('');

        if(inputContainerAjuste) inputContainerAjuste.innerHTML = ajusteHTML;
    }
    
    // Muestra/Oculta selectores de equipos según el tipo de ajuste
    toggleAjusteInputs() {
        const tipoAjuste = document.getElementById('tipoAjuste').value;
        const origenContainer = document.getElementById('equipoOrigenContainer');
        const destinoContainer = document.getElementById('equipoDestinoContainer');
        const origenSelect = document.getElementById('equipoOrigen');
        const destinoSelect = document.getElementById('equipoDestino');

        // Reset
        origenContainer.classList.add('d-none');
        destinoContainer.classList.add('d-none');
        origenSelect.required = false;
        destinoSelect.required = false;

        if (tipoAjuste === 'devolucion') {
            origenContainer.classList.remove('d-none');
            origenSelect.required = true;
        } else if (tipoAjuste === 'reparacion') {
            origenContainer.classList.remove('d-none');
            destinoContainer.classList.remove('d-none');
            origenSelect.required = true;
            destinoSelect.required = true;
        }
    }
    
    async handleAjusteStock(e) {
        e.preventDefault();
        const form = document.getElementById('formAjusteStock');
        form.classList.remove('was-validated'); 
        
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        
        const tipoAjuste = document.getElementById('tipoAjuste').value;
        const equipoOrigen = document.getElementById('equipoOrigen').value;
        const equipoDestino = document.getElementById('equipoDestino').value;
        const ajusteNotes = document.getElementById('ajusteNotes').value.trim();

        const updatesGeneral = {};
        const updatesOrigen = {};
        const updatesDestino = {};
        const movements = [];
        let hasUpdates = false;
        let validationError = false;
        let finalMessage = 'Stock ajustado con éxito.';

        // Limpiar mensajes de error anteriores y preparar la validación de cantidad
        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`ajuste_${m.id}`);
            input.classList.remove('is-invalid');
            input.setCustomValidity('');
            const feedback = document.getElementById(`feedback_ajuste_${m.id}`);
            if (feedback) feedback.textContent = 'Ingresa una cantidad.';
        });

        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`ajuste_${m.id}`);
            const feedback = document.getElementById(`feedback_ajuste_${m.id}`);
            // Usamos parseFloat ya que 'ajusteGeneral' permite negativos
            const amount = parseFloat(input.value) || 0; 
            
            if (amount !== 0) {
                if (tipoAjuste === 'ajusteGeneral') {
                    // AJUSTE GENERAL: Positivo (+) suma, Negativo (-) resta
                    const stockGeneral = this.stockGeneralData[m.id] || 0;
                    if (stockGeneral + amount < 0) {
                        input.setCustomValidity(`El ajuste de ${amount} llevaría el stock a un valor negativo. Stock actual: ${stockGeneral.toFixed(0)}.`);
                        if (feedback) feedback.textContent = `El ajuste de ${amount} llevaría el stock a un valor negativo. Stock actual: ${stockGeneral.toFixed(0)}.`;
                        input.classList.add('is-invalid');
                        validationError = true;
                    } else {
                        updatesGeneral[m.id] = firebase.firestore.FieldValue.increment(amount);
                        movements.push({ 
                            type: amount > 0 ? 'AJUSTE (+)' : 'AJUSTE (-)', 
                            materialId: m.id, 
                            quantity: Math.abs(amount), 
                            notes: ajusteNotes,
                            teamId: null
                        });
                        hasUpdates = true;
                    }

                } else if (tipoAjuste === 'devolucion' || tipoAjuste === 'reparacion') {
                    // DEVOLUCIÓN O RE-ASIGNACIÓN: Mueve stock entre inventarios. La cantidad (amount) debe ser positiva.
                    if (amount <= 0) {
                        input.setCustomValidity('Para Devolución/Re-asignación, la cantidad a mover debe ser positiva.');
                        if (feedback) feedback.textContent = 'La cantidad a mover debe ser positiva.';
                        input.classList.add('is-invalid');
                        validationError = true;
                        return;
                    }
                    
                    // 1. DESCONTAR del equipo origen
                    const equipoOrigenData = this.stockEquiposAllData[equipoOrigen] || {}; 
                    const stockOrigen = equipoOrigenData[m.id] || 0; 

                    if (amount > stockOrigen) {
                        input.setCustomValidity(`Stock insuficiente en Equipo ${equipoOrigen}. Solo hay ${stockOrigen.toFixed(0)}.`);
                        if (feedback) feedback.textContent = `Stock insuficiente en Equipo ${equipoOrigen}. Solo hay ${stockOrigen.toFixed(0)}.`;
                        input.classList.add('is-invalid');
                        validationError = true;
                    } else {
                        updatesOrigen[m.id] = firebase.firestore.FieldValue.increment(-amount);
                        hasUpdates = true;

                        if (tipoAjuste === 'devolucion') {
                            // 2a. DEVOLUCIÓN: AUMENTAR stock general
                            updatesGeneral[m.id] = firebase.firestore.FieldValue.increment(amount);
                            movements.push({ 
                                type: 'DEVOLUCION', 
                                materialId: m.id, 
                                quantity: amount, 
                                notes: ajusteNotes, 
                                teamId: equipoOrigen 
                            });
                            finalMessage = `Materiales devueltos a Stock General desde Equipo ${equipoOrigen}.`;
                        } else {
                            // 2b. RE-ASIGNACIÓN: AUMENTAR stock de equipo destino
                            updatesDestino[m.id] = firebase.firestore.FieldValue.increment(amount);
                            movements.push({ 
                                type: 'REASIGNACION', 
                                materialId: m.id, 
                                quantity: amount, 
                                notes: ajusteNotes, 
                                teamId: equipoOrigen, // Se registra desde el origen
                                targetTeamId: equipoDestino
                            });
                            finalMessage = `Materiales re-asignados de Equipo ${equipoOrigen} a Equipo ${equipoDestino}.`;
                        }
                    }
                }
            } else {
                 input.setCustomValidity('');
            }
        });
        
        if (validationError) {
            form.classList.add('was-validated');
            this.showError('Revisa los campos con error: Stock insuficiente o cantidad inválida.', 'Validación Fallida');
            return;
        }

        if (!hasUpdates) {
            this.showSuccess('No se ingresó ninguna cantidad para ajustar/mover.', 'Sin Cambios');
            return;
        }

        const batch = db.batch(); 
        
        // Ejecutar las transacciones en lote
        if (Object.keys(updatesGeneral).length > 0) {
            batch.set(db.collection('stockGeneral').doc('general'), updatesGeneral, { merge: true });
        }
        // Solo aplica si no es ajuste general
        if (Object.keys(updatesOrigen).length > 0) {
            batch.set(db.collection('stockEquipos').doc(`equipo_${equipoOrigen}`), updatesOrigen, { merge: true });
        }
        // Solo aplica si es re-asignación
        if (Object.keys(updatesDestino).length > 0) {
            batch.set(db.collection('stockEquipos').doc(`equipo_${equipoDestino}`), updatesDestino, { merge: true });
        }

        try {
            await batch.commit();

            // Registrar movimientos DEPUÉS de la actualización exitosa
            for (const mov of movements) {
                // Se registra el movimiento con la función mejorada
                await this.registerStockMovementAjuste(mov.type, mov.materialId, mov.quantity, mov.notes, mov.teamId, mov.targetTeamId);
            }

            this.showSuccess(finalMessage, 'Operación Exitosa');
            form.reset();
            form.classList.remove('was-validated');
            // Resetear la visibilidad de los selectores
            document.getElementById('equipoOrigenContainer').classList.add('d-none');
            document.getElementById('equipoDestinoContainer').classList.add('d-none');
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalAjusteStock'));
            modal.hide();
        } catch (err) {
            console.error('Error al realizar el ajuste/movimiento de stock:', err);
             this.showError('Error al procesar el movimiento. Revisa la consola.', 'Fallo en la Operación');
        }
    }
    
    // Función para registrar AJUSTES, DEVOLUCIONES y REASIGNACIONES
    async registerStockMovementAjuste(type, materialId, quantity, notes, teamId = null, targetTeamId = null) {
        const materialDetails = this.stockMateriales.find(m => m.id === materialId);
        
        if (!materialDetails) {
            console.error(`Error: No se encontró el material con ID ${materialId}`);
            return;
        }
        
        let sign = '';
        let movementTypeDisplay = type;
        
        if (type === 'AJUSTE (+)') {
            sign = '+';
            movementTypeDisplay = 'AJUSTE General';
        } else if (type === 'AJUSTE (-)') {
            sign = '-';
            movementTypeDisplay = 'AJUSTE General';
        } else if (type === 'DEVOLUCION') {
            sign = '+'; 
            movementTypeDisplay = `Devolución (Eq ${teamId} -> General)`;
        } else if (type === 'REASIGNACION') {
            sign = '±'; 
            movementTypeDisplay = `Re-asignación (Eq ${teamId} -> Eq ${targetTeamId})`;
        }

        const quantityText = sign === '±' ? `${quantity.toFixed(0)}` : `${sign} ${quantity.toFixed(0)}`;

        const movementData = {
            type: movementTypeDisplay, 
            materialId: materialId,
            materialLabel: materialDetails.label,
            unidad: materialDetails.unidad,
            quantity: quantity,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            manager: this.managerUser || 'Admin_Desconocido', 
            notes: `${quantityText} ${materialDetails.unidad}. Motivo: ${notes}`,
            teamId: teamId
        };
        
        try {
            await db.collection('stock_movements').add(movementData);
        } catch (err) {
            console.error('Error al registrar el movimiento de stock:', err);
        }
    }
    
    // FIN: NUEVAS FUNCIONES PARA AJUSTE/RE-ASIGNACIÓN

    async handleAsignarMaterial(e) {
        e.preventDefault();
        const form = document.getElementById('formAsignarMaterial');
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        const equipoId = document.getElementById('equipoAsignar').value;
        const assignmentNotes = document.getElementById('assignmentNotes').value.trim();
        const asignacionUpdates = {};
        const stockGeneralUpdates = {};
        const movements = [];
        let hasUpdates = false;
        let validationError = false;
        
        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`asignar_${m.id}`);
            input.classList.remove('is-invalid');
            input.setCustomValidity('');
            const feedback = document.getElementById(`feedback_asignar_${m.id}`);
            if (feedback) feedback.textContent = 'Debe ser un número positivo.';
        });


        this.stockMateriales.filter(m => m.type === 'number').forEach(m => {
            const input = document.getElementById(`asignar_${m.id}`);
            const feedback = document.getElementById(`feedback_asignar_${m.id}`);
            const assigned = parseInt(input.value) || 0;
            
            if (assigned > 0) {
                const stockGeneral = this.stockGeneralData[m.id] || 0;
                
                if (assigned > stockGeneral) {
                    input.setCustomValidity(`Stock insuficiente. Solo hay ${stockGeneral.toFixed(0)} en stock.`);
                    if (feedback) feedback.textContent = `Stock insuficiente. Solo hay ${stockGeneral.toFixed(0)} en stock.`;
                    input.classList.add('is-invalid');
                    validationError = true;
                } else {
                    input.setCustomValidity('');
                    input.classList.remove('is-invalid');
                    
                    asignacionUpdates[m.id] = firebase.firestore.FieldValue.increment(assigned);
                    stockGeneralUpdates[m.id] = firebase.firestore.FieldValue.increment(-assigned);
                    movements.push({ materialId: m.id, quantity: assigned, notes: assignmentNotes, teamId: equipoId });
                    
                    hasUpdates = true;
                }
            } else {
                 input.setCustomValidity('');
            }
        });
        
        if (validationError) {
            this.showError('Revisa los campos con error: Stock general insuficiente.', 'Validación Fallida');
            return;
        }

        if (!hasUpdates) {
            this.showSuccess('No se ingresó ninguna cantidad positiva para asignar.', 'Sin Cambios');
            return;
        }

        const batch = db.batch(); 
        const equipoRef = db.collection('stockEquipos').doc(`equipo_${equipoId}`);
        const stockGeneralRef = db.collection('stockGeneral').doc('general');

        batch.set(equipoRef, asignacionUpdates, { merge: true });
        batch.update(stockGeneralRef, stockGeneralUpdates);

        try {
            await batch.commit();

            for (const mov of movements) {
                await this.registerStockMovement('ASIGNACION', mov.materialId, mov.quantity, mov.notes, mov.teamId);
            }

            this.showSuccess(`Materiales asignados al Equipo ${equipoId} y descontados del Stock General. 🚚`, 'Asignación Exitosa');
            form.reset();
            form.classList.remove('was-validated');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalAsignarMaterial'));
            modal.hide();
        } catch (err) {
            console.error('Error al asignar material y descontar stock:', err);
             this.showError('Error al asignar material. Revisa la consola.', 'Fallo en la Operación');
        }
    }


    // =================================================================
    // =========== UTILIDADES (SweetAlert2) ============================
    // =================================================================

    showSuccess(message, title = 'Éxito') {
        Swal.fire({
            icon: 'success',
            title: title,
            text: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }

    showError(message, title = 'Error') {
        Swal.fire({
            icon: 'error',
            title: title,
            text: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }
}

window.addEventListener('DOMContentLoaded', ()=>{
    if (typeof Swal === 'undefined') {
        console.error("SweetAlert2 no está cargado. Usando alertas nativas.");
        StockManager.prototype.showSuccess = function(message) { alert(`Éxito: ${message}`); };
        StockManager.prototype.showError = function(message) { alert(`Error: ${message}`); };
    }
    window.stockManager = new StockManager();
});
