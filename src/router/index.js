import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { pinia } from '@/stores/pinia'
import { useProgressStore } from '@/stores/progress'


const SignIn = () => import('@/views/SignIn.vue')
const MyTimesheet = () => import('@/views/MyTimesheet.vue')
const AddEntry = () => import('@/views/AddEntry.vue')
const SubmitTimesheet = () => import('@/views/SubmitTimesheet.vue')
const ApprovalInbox = () => import('@/views/ApprovalInbox.vue')
const ApprovalDetail = () => import('@/views/ApprovalDetail.vue')
const SystemReady = () => import('@/views/SystemReady.vue')
const Report = () => import('@/views/Report.vue')
const Organisation = () => import('@/views/Organisation.vue')

const routes = [
  {
    path: '/',
    redirect: '/timesheet',
  },
  {
    path: '/signin',
    name: 'signin',
    component: SignIn,
    meta: {
      guestOnly: true,
      title: 'Sign In',
    },
  },
  {
    path: '/timesheet',
    name: 'timesheet',
    component: MyTimesheet,
    meta: {
      requiresAuth: true,
      title: 'My Timesheet',
    },
  },
  {
    path: '/entries/edit',
    name: 'add-entry',
    component: AddEntry,
    meta: {
      requiresAuth: true,
      title: 'Add / Edit Time Entry',
    },
  },
  {
    path: '/timesheet/submit',
    name: 'submit-timesheet',
    component: SubmitTimesheet,
    meta: {
      requiresAuth: true,
      title: 'Submit Timesheet',
    },
  },
  {
    path: '/approvals',
    name: 'approval-inbox',
    component: ApprovalInbox,
    meta: {
      requiresAuth: true,
      roles: ['supervisor', 'admin'],
      title: 'Approval Inbox',
    },
  },
  {
    path: '/approvals/:id',
    name: 'approval-detail',
    component: ApprovalDetail,
    meta: {
      requiresAuth: true,
      roles: ['supervisor', 'admin'],
      title: 'Approval Detail',
    },
  },
  {
    path: '/reports',
    name: 'report',
    component: Report,
    meta: {
      requiresAuth: true,
      title: 'Project Hours Report',
    },
  },
  {
    path: '/organisation',
    name: 'organisation',
    component: Organisation,
    meta: {
      requiresAuth: true,
      roles: ['admin'],
      title: 'Organisation & Users',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/timesheet',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const progressStore = useProgressStore(pinia)
  progressStore.start()
  const authStore = useAuthStore(pinia)
  await authStore.initialize()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const guestOnly = to.matched.some((record) => record.meta.guestOnly)
  const allowedRoles = to.meta.roles || []

  if (requiresAuth && !authStore.isAuthenticated) {
    return {
      name: 'signin',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  if (guestOnly && authStore.isAuthenticated) {
    return { name: 'timesheet' }
  }

  if (
    requiresAuth &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(authStore.role)
  ) {
    return { name: 'timesheet' }
  }

  return true
})

router.afterEach(() => {
  const progressStore = useProgressStore(pinia)
  progressStore.finish()
})

export default router
