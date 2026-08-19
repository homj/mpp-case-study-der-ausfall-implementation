import { useTranslation } from 'react-i18next'
import type { NotificationView, TerminoWriteView } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocale } from '@/i18n/use-locale'
import { formatDateTimeLong } from '@/lib/datetime'

export function OutboxPanel({
  terminoWrites,
  notifications,
}: {
  terminoWrites: TerminoWriteView[]
  notifications: NotificationView[]
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('outbox.heading')}</CardTitle>
        <CardDescription>{t('outbox.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="termino-writes">
          <TabsList>
            <TabsTrigger value="termino-writes">{t('outbox.tab_termino_writes')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('outbox.tab_notifications')}</TabsTrigger>
          </TabsList>

          <TabsContent value="termino-writes" className="mt-4">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('outbox.column.kind')}</TableHead>
                    <TableHead>{t('outbox.column.target')}</TableHead>
                    <TableHead>{t('outbox.column.status')}</TableHead>
                    <TableHead>{t('outbox.column.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terminoWrites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>{t('outbox.empty')}</TableCell>
                    </TableRow>
                  ) : (
                    terminoWrites.map((write) => (
                      <TableRow key={write.id}>
                        <TableCell>{t(`outbox.op.${write.op}`)}</TableCell>
                        <TableCell className="font-mono text-xs">{write.target}</TableCell>
                        <TableCell>
                          <Badge variant={write.status === 'failed' ? 'destructive' : 'secondary'}>
                            {t(`outbox.write_status.${write.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTimeLong(write.createdAt, locale)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('outbox.column.kind')}</TableHead>
                    <TableHead>{t('outbox.column.recipient')}</TableHead>
                    <TableHead>{t('outbox.column.subject')}</TableHead>
                    <TableHead>{t('outbox.column.status')}</TableHead>
                    <TableHead>{t('outbox.column.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>{t('outbox.empty')}</TableCell>
                    </TableRow>
                  ) : (
                    notifications.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>{t(`outbox.channel.${notification.channel}`)}</TableCell>
                        <TableCell className="font-mono text-xs">{notification.recipient}</TableCell>
                        <TableCell>{notification.subject}</TableCell>
                        <TableCell>
                          <Badge
                            variant={notification.status === 'failed' ? 'destructive' : 'secondary'}
                          >
                            {t(`outbox.notification_status.${notification.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTimeLong(notification.createdAt, locale)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
