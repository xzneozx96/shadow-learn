import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { StudySession } from '@/components/study/StudySession'

export function StudySessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()

  return (
    <Layout>
      <StudySession lessonId={lessonId!} onClose={() => navigate(-1)} />
    </Layout>
  )
}
