-- Add i18n JSONB columns for skill name and description translations
ALTER TABLE skills ADD COLUMN IF NOT EXISTS name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Populate translations for 13 official skills
UPDATE skills SET
  name_i18n = '{"zh-TW": "Arinova 幫助", "ja": "Arinova ヘルプ"}'::jsonb,
  description_i18n = '{"zh-TW": "取得 Arinova 功能、設定及疑難排解的協助", "ja": "Arinovaの機能、設定、トラブルシューティングのサポート"}'::jsonb
WHERE slug = 'arinova-help';

UPDATE skills SET
  name_i18n = '{"zh-TW": "自動化工作流", "ja": "自動化ワークフロー"}'::jsonb,
  description_i18n = '{"zh-TW": "設計並優化自動化工作流程與流程", "ja": "自動化ワークフローとプロセスの設計と最適化"}'::jsonb
WHERE slug = 'automation-workflows';

UPDATE skills SET
  name_i18n = '{"zh-TW": "內容創作者", "ja": "コンテンツクリエーター"}'::jsonb,
  description_i18n = '{"zh-TW": "生成創意內容、文案及社群媒體貼文", "ja": "クリエイティブコンテンツ、コピーライティング、SNS投稿の生成"}'::jsonb
WHERE slug = 'content-creator';

UPDATE skills SET
  name_i18n = '{"zh-TW": "深度研究", "ja": "ディープリサーチ"}'::jsonb,
  description_i18n = '{"zh-TW": "進行深入研究，附帶引用來源與分析", "ja": "出典付きの徹底的なリサーチと分析"}'::jsonb
WHERE slug = 'deep-research';

UPDATE skills SET
  name_i18n = '{"zh-TW": "編輯校對", "ja": "エディター"}'::jsonb,
  description_i18n = '{"zh-TW": "校對、編輯並改善文字內容", "ja": "文章の校正、編集、改善"}'::jsonb
WHERE slug = 'editor';

UPDATE skills SET
  name_i18n = '{"zh-TW": "事實查核", "ja": "ファクトチェッカー"}'::jsonb,
  description_i18n = '{"zh-TW": "驗證聲明、核實事實並辨識不實資訊", "ja": "主張の検証、事実確認、誤情報の特定"}'::jsonb
WHERE slug = 'fact-checker';

UPDATE skills SET
  name_i18n = '{"zh-TW": "決策助手", "ja": "意思決定ヘルパー"}'::jsonb,
  description_i18n = '{"zh-TW": "分析選項、權衡利弊，做出更好的決策", "ja": "選択肢の分析、メリット・デメリットの比較、より良い意思決定の支援"}'::jsonb
WHERE slug = 'decision-helper';

UPDATE skills SET
  name_i18n = '{"zh-TW": "學術研究員", "ja": "学術リサーチャー"}'::jsonb,
  description_i18n = '{"zh-TW": "協助撰寫學術論文、文獻回顧及引用格式", "ja": "学術論文、文献レビュー、引用のサポート"}'::jsonb
WHERE slug = 'academic-researcher';

UPDATE skills SET
  name_i18n = '{"zh-TW": "數據分析師", "ja": "データアナリスト"}'::jsonb,
  description_i18n = '{"zh-TW": "分析數據、建立視覺化圖表並提取洞察", "ja": "データ分析、可視化の作成、インサイトの抽出"}'::jsonb
WHERE slug = 'data-analyst';

UPDATE skills SET
  name_i18n = '{"zh-TW": "蘇格拉底式教學", "ja": "ソクラテス式解説"}'::jsonb,
  description_i18n = '{"zh-TW": "透過蘇格拉底式提問與對話來教導概念", "ja": "ソクラテス式問答法と対話による概念の教育"}'::jsonb
WHERE slug = 'explain-like-socrates';

UPDATE skills SET
  name_i18n = '{"zh-TW": "HR 專家", "ja": "HR プロ"}'::jsonb,
  description_i18n = '{"zh-TW": "處理人資任務，包括招募、政策及員工關係", "ja": "採用、ポリシー、従業員関係を含む人事業務の対応"}'::jsonb
WHERE slug = 'hr-pro';

UPDATE skills SET
  name_i18n = '{"zh-TW": "學術寫作", "ja": "科学論文ライティング"}'::jsonb,
  description_i18n = '{"zh-TW": "撰寫並修改科學論文、摘要及報告", "ja": "科学論文、要旨、レポートの執筆と推敲"}'::jsonb
WHERE slug = 'scientific-writing';

UPDATE skills SET
  name_i18n = '{"zh-TW": "SEO 基礎", "ja": "SEO 基礎"}'::jsonb,
  description_i18n = '{"zh-TW": "透過關鍵字與結構分析優化搜尋引擎內容", "ja": "キーワードと構造分析によるSEOコンテンツの最適化"}'::jsonb
WHERE slug = 'seo-fundamentals';
