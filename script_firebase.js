// ====== coloca aquí tu firebaseConfig real ======
const firebaseConfig = {
  apiKey: "AIzaSyA6D0F9Ex3K7h2__PlNaMiREkeaa1StVkc",
  authDomain: "ordenes-instalacion.firebaseapp.com",
  projectId: "ordenes-instalacion",
  storageBucket: "ordenes-instalacion.firebasestorage.app",
  messagingSenderId: "424944239546",
  appId: "1:424944239546:web:b6c783855ae4f3b0799383",
  measurementId: "G-B2K0XR5D5K"
};
// ================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Util: convertir varios formatos a Date
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

      const navTabs = document.getElementById('myTab');
      if (navTabs) {
          navTabs.addEventListener('shown.bs.tab', (event) => {
              const targetId = event.target.getAttribute('data-bs-target').substring(1);
              this.unloadListeners();
              if (targetId === 'orders') {
                  this.loadPendingRealtime();
              } else if (targetId === 'completed') {
                  this.loadCompletedRealtime();
              }
          });
      }

      const activeTab = document.querySelector('.nav-link.active');
      const activeTabId = activeTab.getAttribute('data-bs-target').substring(1);
      if (activeTabId === 'orders') {
          this.loadPendingRealtime();
      } else if (activeTabId === 'completed') {
          this.loadCompletedRealtime();
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
          this.chartZona.destroy();
          this.chartZona = null;
      }
      if (this.chartPlan) {
          this.chartPlan.destroy();
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
              }
          };
          
          await db.collection('ordenes').add(order);
          this.showSuccess('Orden guardada con éxito');
          document.getElementById('orderForm').reset();
          document.getElementById('orderForm').classList.remove('was-validated');
      } catch(err) {
          console.error('Error guardando orden:', err);
          alert('Error guardando la orden. Revisa la consola para más detalles.');
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
  
  // Nueva función para generar filas de tabla
  createCompletedOrderRow(order) {
      const fechaCompletado = toDate(order.fechaCompletado);
      const fechaTxt = fechaCompletado ? fechaCompletado.toLocaleString('es-ES') : '-';
      const tipoOrdenTxt = order.tipo === 'reconversion' ? 'Reconversión' : 'Instalación';
      const ubicacionLink = order.domicilio?.ubicacion ? `<a href="${order.domicilio.ubicacion}" target="_blank">Ver en Maps</a>` : '-';
  
      return `
          <tr>
              <td>${order.cliente?.nombre || '-'}</td>
              <td>${order.cliente?.numeroCliente || '-'}</td>
              <td>${order.cliente?.email || '-'}</td>
              <td>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</td>
              <td>${ubicacionLink}</td>
              <td>${order.domicilio?.zona || '-'}</td>
              <td>${order.instalacion?.plan || '-'}</td>
              <td>Equipo ${order.instalacion?.equipo || '-'}</td>
              <td>${tipoOrdenTxt}</td>
              <td>${order.creadoPor || '-'}</td>
              <td>${fechaTxt}</td>
          </tr>
      `;
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

          // Calcular métricas
          const metrics = {
              porZona: {},
              porPlan: {}
          };

          docs.forEach(order => {
              const zona = order.domicilio?.zona || 'Sin Zona';
              metrics.porZona[zona] = (metrics.porZona[zona] || 0) + 1;
              const plan = order.instalacion?.plan || 'Sin Plan';
              metrics.porPlan[plan] = (metrics.porPlan[plan] || 0) + 1;
          });

          // Renderizar los gráficos con los datos
          this.renderCharts(metrics);

          // Construir la tabla con los datos
          const tableHtml = `
              <div class="table-responsive">
                  <table class="table table-striped table-hover">
                      <thead class="table-dark">
                          <tr>
                              <th scope="col">Cliente</th>
                              <th scope="col">N° Cliente</th>
                              <th scope="col">Email</th>
                              <th scope="col">Dirección</th>
                              <th scope="col">Ubicación</th>
                              <th scope="col">Zona</th>
                              <th scope="col">Plan</th>
                              <th scope="col">Equipo</th>
                              <th scope="col">Tipo</th>
                              <th scope="col">Creado por</th>
                              <th scope="col">Fecha Completado</th>
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

  renderCharts(metrics) {
      // Función auxiliar para generar colores
      const dynamicColors = () => {
          const r = Math.floor(Math.random() * 255);
          const g = Math.floor(Math.random() * 255);
          const b = Math.floor(Math.random() * 255);
          return `rgb(${r},${g},${b})`;
      };

      if (this.chartZona) this.chartZona.destroy();
      if (this.chartPlan) this.chartPlan.destroy();

      const chartZonaCtx = document.getElementById('chartZona').getContext('2d');
      const chartPlanCtx = document.getElementById('chartPlan').getContext('2d');

      const zonaLabels = Object.keys(metrics.porZona);
      const zonaData = Object.values(metrics.porZona);
      const zonaColors = zonaLabels.map(() => dynamicColors());

      this.chartZona = new Chart(chartZonaCtx, {
          type: 'pie',
          data: {
              labels: zonaLabels,
              datasets: [{
                  data: zonaData,
                  backgroundColor: zonaColors,
                  hoverOffset: 4
              }]
          },
          options: {
              responsive: true,
              plugins: {
                  legend: {
                      position: 'top',
                  },
                  tooltip: {
                      callbacks: {
                          label: function(context) {
                              const label = context.label || '';
                              const value = context.parsed || 0;
                              const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                              const percentage = ((value / total) * 100).toFixed(2);
                              return `${label}: ${value} (${percentage}%)`;
                          }
                      }
                  }
              }
          }
      });

      const planLabels = Object.keys(metrics.porPlan);
      const planData = Object.values(metrics.porPlan);
      const planColors = planLabels.map(() => dynamicColors());

      this.chartPlan = new Chart(chartPlanCtx, {
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
              scales: {
                  y: {
                      beginAtZero: true,
                      ticks: {
                          stepSize: 1
                      }
                  }
              }
          }
      });
  }

  createOrderCard(order) {
      const fechaInst = toDate(order.instalacion?.fecha);
      const fechaTxt = fechaInst ? fechaInst.toLocaleString('es-ES') : '-';
      const tipoOrdenTxt = order.tipo === 'reconversion' ? 'Reconversión' : 'Instalación';
      const ubicacionLink = order.domicilio?.ubicacion ? `<a href="${order.domicilio.ubicacion}" target="_blank">Ver en Maps</a>` : '-';
      return `
          <div class="col-md-6 col-lg-4">
              <div class="card order-card mb-3">
                  <div class="card-header d-flex justify-content-between align-items-center">
                      <span>Orden #${order.id.substr(-6)}</span>
                      <span class="badge bg-warning">${tipoOrdenTxt}</span>
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

  createCompletedOrderCard(order) {
      const fechaCompletado = toDate(order.fechaCompletado);
      const fechaTxt = fechaCompletado ? fechaCompletado.toLocaleString('es-ES') : '-';
      return `
          <div class="col-md-6 col-lg-4">
              <div class="card order-card mb-3 border-success">
                  <div class="card-header bg-success d-flex justify-content-between align-items-center">
                      <span>Orden #${order.id.substr(-6)}</span>
                      <span class="badge bg-light text-success">Completada</span>
                  </div>
                  <div class="card-body">
                      <h6 class="card-title text-success">${order.cliente?.nombre || '-'}</h6>
                      <p class="small text-muted mb-1">Completada por: <strong>Equipo ${order.instalacion?.equipo || '-'}</strong></p>
                      <p class="small mb-1"><i class="fas fa-id-card me-2"></i>DNI: ${order.cliente?.dni || '-'}</p>
                      <p class="small mb-1"><strong>N° Cliente:</strong> ${order.cliente?.numeroCliente || '-'}</p>
                      <p class="small mb-1"><i class="fas fa-envelope me-2"></i>Email: ${order.cliente?.email || '-'}</p>
                      <p class="small mb-1"><i class="fas fa-phone me-2"></i>Teléfono: ${order.cliente?.telefono || '-'}</p>
                      <p class="small mb-1"><i class="fas fa-map-marker-alt me-2"></i>${order.domicilio?.direccion || '-'} ${order.domicilio?.numero || ''}</p>
                      <p class="small mb-1"><strong>Zona:</strong> ${order.domicilio?.zona || '-'}</p>
                      <p class="small mb-1"><strong>Plan:</strong> ${order.instalacion?.plan || '-'}</p>
                      <p class="small mb-1"><strong>Finalizada:</strong> ${fechaTxt}</p>
                  </div>
              </div>
          </div>
      `;
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
              fechaCompletado: firebase.firestore.FieldValue.delete()
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
}

window.addEventListener('DOMContentLoaded', ()=>{
  window.orderManager = new OrderManager();
});