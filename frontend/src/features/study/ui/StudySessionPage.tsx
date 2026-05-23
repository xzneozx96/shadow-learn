import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/app/Layout'
import { StudySession } from '@/features/study/ui/StudySession'

export function StudySessionPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()

  return (
    <Layout>
      <StudySession lessonId={lessonId!} onClose={() => navigate(-1)} />
    </Layout>
  )
}
