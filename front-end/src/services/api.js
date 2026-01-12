import axios from 'axios'
import { useCatsStore } from '../stores/cats'
import { useToast } from "vue-toastification"

const api = axios.create({
  baseURL: 'http://localhost:3000'
})

const toast = useToast()

api.interceptors.response.use(
  (response) => {
    // Tenta pegar do corpo da resposta, se não tiver, tenta do config
    const id = response.data?.sessionId || response.config.params?.sessionId || 'global'

    const store = useCatsStore()
    store.addCat(id, response.status, response.data)
    toast.success(`Sessão ${id}: Sucesso`)

    return response
  },
  (error) => {
    // No erro, o sessionId costuma vir no error.response.data
    const id = error.response?.data?.sessionId || error.config?.params?.sessionId || 'error'

    const store = useCatsStore()
    if (error.response) {
      store.addCat(id, error.response.status, error.response.data)
      toast.error(`Erro ${id}: ${error.response.data.error}`)
    }
    return Promise.reject(error)
  }
)

export default api
