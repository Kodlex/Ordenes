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
        this.unsubscribe = null;
        this.checkLogin();
        this.init();
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
        this.loadTeamOrdersRealtime();
    }

    logout() {
        localStorage.removeItem('userType');
        localStorage.removeItem('equipoId');
        window.location.href = 'login.html';
    }

    loadTeamOrdersRealtime() {
        const container = document.getElementById('teamOrdersContainer');
        const equipoId = this.equipoId; 

        if (!container || !equipoId) return;
        
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        const q = db.collection('ordenes')
                    .where('estado', '==', 'pendiente')
                    .where('instalacion.equipo', '==', equipoId);

        this.unsubscribe = q.onSnapshot(snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a,b) => {
                const da = toDate(a.instalacion?.fecha) || new Date(0);
                const db_ = toDate(b.instalacion?.fecha) || new Date(0);
                return da - db_;
            });
            if (!docs.length) {
                container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-folder-open fa-3x mb-3"></i><h5>No tienes órdenes asignadas</h5></div>`;
            } else {
                container.innerHTML = docs.map(o => this.createOrderCard(o)).join('');
            }
        }, err => {
            console.error('Error listener equipo:', err);
            container.innerHTML = `<div class="col-12 alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>Error al cargar las órdenes.
                <br>Verifica la configuración de Firebase y la consola para más detalles.
            </div>`;
        });
    }

    /**
     * Crea un campo de material con un input-group compacto.
     */
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

        // Materiales agrupados
        const fibraInputs = this.getMaterialInputsByGroup('fibra', order.id);
        const coaxialInputs = this.getMaterialInputsByGroup('coaxial', order.id);
        const variosInputs = this.getMaterialInputsByGroup('varios', order.id);

        // Campo 'Otros' (texto)
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

        if (materialesUsados) {
            // Recoger todos los materiales, ya sean numéricos o de texto
            this.materialesLista.forEach(m => {
                const input = form.querySelector(`[name="${m.id}"]`);
                if (input) {
                    if (m.type === 'number') {
                        materialsData[m.id] = parseInt(input.value) || 0;
                    } else { // 'otros' (texto)
                        materialsData[m.id] = input.value.trim();
                    }
                }
            });
        }
        
        // Siempre recopilar el comentario general
        const comentarioInput = form.querySelector('[name="comentario"]');
        materialsData.comentario = comentarioInput ? comentarioInput.value.trim() : '';

        try {
            await db.collection('ordenes').doc(id).update({
                estado: 'completado',
                fechaCompletado: firebase.firestore.FieldValue.serverTimestamp(),
                materialesGastados: materialsData 
            });
        } catch(err) {
            console.error('Error marcando completada (equipo):', err);
            alert('Error marcando completada. Revisa consola.');
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.teamPanel = new EquipoPanel();
});

