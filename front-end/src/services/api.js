import axios from 'axios'
import { useCatsStore } from '../stores/cats'

const api = axios.create({
  baseURL: 'http://localhost:3000'
})

api.interceptors.response.use(
  (response) => {
    const store = useCatsStore()
    
    const id = response.config.params?.sessionId || 'global'
    store.addCat(id, response.status, response.data)
    
    return response
  },
  (error) => {
    const store = useCatsStore()
    
    if (error.response) {
      const id = error.config.params?.sessionId || 'error-log'
      store.addCat(id, error.response.status, error.response.data)
    }
    
    return Promise.reject(error)
  }
)

export default api
