import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setUser, clearUser } from '../features/auth/authSlice.js';

const json = (url, method, body) => ({ url, method, body });

/**
 * One RTK Query API slice for the whole app. Tags keep screens in sync:
 * e.g. completing a lesson invalidates 'Learn' + 'MyCourses', so progress bars refresh everywhere.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: ['Courses', 'Course', 'Manage', 'MyCourses', 'Learn', 'Certificates', 'Live', 'Revenue', 'Admin'],
  endpoints: (b) => ({
    /* ---------- auth ---------- */
    me: b.query({
      query: () => '/auth/me',
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data.user));
        } catch {
          dispatch(clearUser());
        }
      },
    }),
    login: b.mutation({
      query: (body) => json('/auth/login', 'POST', body),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data.user));
        } catch {
          /* surfaced by the form */
        }
      },
    }),
    register: b.mutation({
      query: (body) => json('/auth/register', 'POST', body),
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data.user));
        } catch {
          /* surfaced by the form */
        }
      },
    }),
    logout: b.mutation({ query: () => json('/auth/logout', 'POST') }),

    /* ---------- catalog ---------- */
    getCourses: b.query({
      query: (params) => ({ url: '/courses', params }),
      providesTags: ['Courses'],
    }),
    getCourse: b.query({
      query: (idOrSlug) => `/courses/${idOrSlug}`,
      providesTags: ['Course'],
    }),
    enrollFree: b.mutation({
      query: (courseId) => json(`/enrollments/free/${courseId}`, 'POST'),
      invalidatesTags: ['Course', 'MyCourses', 'Courses'],
    }),

    /* ---------- learning ---------- */
    myEnrollments: b.query({ query: () => '/enrollments/mine', providesTags: ['MyCourses'] }),
    courseLearn: b.query({ query: (courseId) => `/enrollments/course/${courseId}`, providesTags: ['Learn'] }),
    getPlayback: b.query({ query: (lessonId) => `/lessons/${lessonId}/playback`, keepUnusedDataFor: 30 }),
    savePosition: b.mutation({
      query: ({ courseId, lessonId, seconds }) => json(`/enrollments/course/${courseId}/lessons/${lessonId}/position`, 'PUT', { seconds }),
    }),
    completeLesson: b.mutation({
      query: ({ courseId, lessonId }) => json(`/enrollments/course/${courseId}/lessons/${lessonId}/complete`, 'POST'),
      invalidatesTags: ['Learn', 'MyCourses', 'Certificates'],
    }),

    /* ---------- quizzes ---------- */
    getQuiz: b.query({ query: (id) => `/quizzes/${id}`, keepUnusedDataFor: 0 }),
    submitAttempt: b.mutation({
      query: ({ quizId, answers }) => json(`/quizzes/${quizId}/attempts`, 'POST', { answers }),
      invalidatesTags: ['Learn', 'MyCourses', 'Certificates'],
    }),
    createQuiz: b.mutation({
      query: ({ courseId, ...body }) => json(`/courses/${courseId}/quizzes`, 'POST', body),
      invalidatesTags: ['Manage'],
    }),
    updateQuiz: b.mutation({
      query: ({ id, ...body }) => json(`/quizzes/${id}`, 'PUT', body),
      invalidatesTags: ['Manage'],
    }),
    deleteQuiz: b.mutation({ query: (id) => json(`/quizzes/${id}`, 'DELETE'), invalidatesTags: ['Manage'] }),

    /* ---------- payments ---------- */
    checkout: b.mutation({ query: (courseId) => json('/payments/checkout', 'POST', { courseId }) }),
    mockConfirm: b.mutation({ query: (paymentId) => json(`/payments/${paymentId}/mock-confirm`, 'POST') }),
    paymentStatus: b.query({
      query: (paymentId) => `/payments/${paymentId}/status`,
      keepUnusedDataFor: 0,
    }),

    /* ---------- certificates ---------- */
    myCertificates: b.query({ query: () => '/certificates/mine', providesTags: ['Certificates'] }),
    verifyCertificate: b.query({ query: (code) => `/certificates/verify/${code}` }),

    /* ---------- instructor ---------- */
    teachingCourses: b.query({ query: () => '/courses/mine', providesTags: ['Manage', 'Courses'] }),
    createCourse: b.mutation({ query: (body) => json('/courses', 'POST', body), invalidatesTags: ['Manage'] }),
    updateCourse: b.mutation({
      query: ({ id, ...body }) => json(`/courses/${id}`, 'PATCH', body),
      invalidatesTags: ['Manage', 'Course', 'Courses'],
    }),
    deleteCourse: b.mutation({ query: (id) => json(`/courses/${id}`, 'DELETE'), invalidatesTags: ['Manage', 'Courses'] }),
    submitCourse: b.mutation({ query: (id) => json(`/courses/${id}/submit`, 'POST'), invalidatesTags: ['Manage'] }),
    manageCourse: b.query({ query: (id) => `/courses/${id}/manage`, providesTags: ['Manage'] }),
    addLesson: b.mutation({
      query: ({ courseId, ...body }) => json(`/courses/${courseId}/lessons`, 'POST', body),
      invalidatesTags: ['Manage'],
    }),
    updateLesson: b.mutation({
      query: ({ id, ...body }) => json(`/lessons/${id}`, 'PATCH', body),
      invalidatesTags: ['Manage'],
    }),
    deleteLesson: b.mutation({ query: (id) => json(`/lessons/${id}`, 'DELETE'), invalidatesTags: ['Manage'] }),
    reorderLessons: b.mutation({
      query: ({ courseId, ids }) => json(`/courses/${courseId}/lessons/reorder`, 'PUT', { ids }),
      invalidatesTags: ['Manage'],
    }),
    revenue: b.query({ query: (months = 12) => `/instructor/revenue?months=${months}`, providesTags: ['Revenue'] }),
    courseStudents: b.query({ query: (courseId) => `/instructor/courses/${courseId}/students` }),

    /* ---------- live classes ---------- */
    upcomingLive: b.query({ query: () => '/live/upcoming', providesTags: ['Live'] }),
    getLive: b.query({ query: (id) => `/live/${id}`, providesTags: ['Live'] }),
    scheduleLive: b.mutation({
      query: ({ courseId, ...body }) => json(`/courses/${courseId}/live`, 'POST', body),
      invalidatesTags: ['Live', 'Manage'],
    }),
    startLive: b.mutation({ query: (id) => json(`/live/${id}/start`, 'POST'), invalidatesTags: ['Live', 'Manage'] }),
    endLive: b.mutation({ query: (id) => json(`/live/${id}/end`, 'POST'), invalidatesTags: ['Live', 'Manage'] }),
    cancelLive: b.mutation({ query: (id) => json(`/live/${id}`, 'DELETE'), invalidatesTags: ['Live', 'Manage'] }),
    liveToken: b.mutation({ query: (id) => json(`/live/${id}/token`, 'POST') }),
    liveMessages: b.query({ query: (id) => `/live/${id}/messages`, keepUnusedDataFor: 0 }),

    /* ---------- admin ---------- */
    adminStats: b.query({ query: () => '/admin/stats', providesTags: ['Admin'] }),
    adminUsers: b.query({ query: (params) => ({ url: '/admin/users', params }), providesTags: ['Admin'] }),
    updateUser: b.mutation({ query: ({ id, ...body }) => json(`/admin/users/${id}`, 'PATCH', body), invalidatesTags: ['Admin'] }),
    adminCourses: b.query({ query: (status) => ({ url: '/admin/courses', params: status ? { status } : {} }), providesTags: ['Admin'] }),
    reviewCourse: b.mutation({
      query: ({ id, ...body }) => json(`/admin/courses/${id}/review`, 'PATCH', body),
      invalidatesTags: ['Admin', 'Courses', 'Course'],
    }),
  }),
});

export const {
  useMeQuery, useLoginMutation, useRegisterMutation, useLogoutMutation,
  useGetCoursesQuery, useGetCourseQuery, useEnrollFreeMutation,
  useMyEnrollmentsQuery, useCourseLearnQuery, useGetPlaybackQuery, useSavePositionMutation, useCompleteLessonMutation,
  useGetQuizQuery, useSubmitAttemptMutation, useCreateQuizMutation, useUpdateQuizMutation, useDeleteQuizMutation,
  useCheckoutMutation, useMockConfirmMutation, usePaymentStatusQuery,
  useMyCertificatesQuery, useVerifyCertificateQuery,
  useTeachingCoursesQuery, useCreateCourseMutation, useUpdateCourseMutation, useDeleteCourseMutation, useSubmitCourseMutation,
  useManageCourseQuery, useAddLessonMutation, useUpdateLessonMutation, useDeleteLessonMutation, useReorderLessonsMutation,
  useRevenueQuery, useCourseStudentsQuery,
  useUpcomingLiveQuery, useGetLiveQuery, useScheduleLiveMutation, useStartLiveMutation, useEndLiveMutation, useCancelLiveMutation,
  useLiveTokenMutation, useLiveMessagesQuery,
  useAdminStatsQuery, useAdminUsersQuery, useUpdateUserMutation, useAdminCoursesQuery, useReviewCourseMutation,
} = api;

/** Extract a readable message from an RTK Query error. */
export const errMsg = (e) => e?.data?.message || e?.error || (e?.status ? `Request failed (${e.status})` : 'Something went wrong');
