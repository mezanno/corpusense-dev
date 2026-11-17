import ConfigurationAPITab from '@/components/features/configuration/ConfigurationAPITab';
import ConfigurationGeneralTab from '@/components/features/configuration/ConfigurationGeneralTab';
import ConfigurationLLMTab from '@/components/features/configuration/ConfigurationLLMTab';
import ConfigurationThemeTab from '@/components/features/configuration/ConfigurationThemeTab';
import PageHeader from '@/components/layout/PageHeader';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bolt } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ConfigurationPage = () => {
  const { t } = useTranslation();

  return (
    <section className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader title={t('page_title_configuration')} icon={Bolt} />
      <ScrollArea className='min-h-0 flex-1'>
        <div className='pr-4'>
          <Tabs defaultValue='general'>
            <TabsList>
              <TabsTrigger value='general'>{t('tab_configuration_general')}</TabsTrigger>
              <TabsTrigger value='theme'>{t('tab_configuration_theme')}</TabsTrigger>
              <TabsTrigger value='api'>{t('tab_configuration_api')}</TabsTrigger>
              <TabsTrigger value='ai'>{t('tab_configuration_llm')}</TabsTrigger>
            </TabsList>
            <TabsContent value='general'>
              <ConfigurationGeneralTab />
            </TabsContent>
            <TabsContent value='theme'>
              <ConfigurationThemeTab />
            </TabsContent>
            <TabsContent value='api'>
              <ConfigurationAPITab />
            </TabsContent>
            <TabsContent value='ai'>
              <ConfigurationLLMTab />
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </section>
  );
};

export default ConfigurationPage;
