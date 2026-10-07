// Every job type Find can search for, grouped into categories (the Job types dropdown).
// Each type: words a job title must contain (any of them; "ux+research" needs both words, and a word matches the
// start of a title word, so "illustrat" matches "Illustrator"), words that rule a title out, and what to type into
// LinkedIn and Handshake's search box. "excludeTechnical" also rules out engineering words (config.finder.technicalWords),
// for design jobs. "categories" limits SimplifyJobs listings to its own categories.
// To add your own, put them under finder.presets in config.json (same shape); those win over these.

// What gets typed into LinkedIn/Handshake: the type's own search words, or its first two match words.
const plain = (words) => words.map((w) => w.replace(/^=/, '').replace(/\+/g, ' ').trim());
const t = (key, label, include, more = {}) => ({ key, label, include, ...more, search: more.search || plain(include.slice(0, 2)) });
const NOT_TECH = ['engineer', 'developer', 'software'];

export const CATEGORIES = {
  'Accounting & finance': [
    t('accounting', 'Accounting & bookkeeping', ['accountant', 'accounting', 'bookkeep', 'accounts payable', 'accounts receivable', 'payroll']),
    t('audit', 'Audit & assurance', ['audit', 'assurance', 'internal control']),
    t('corpfinance', 'Corporate finance & FP&A', ['financial analyst', 'fp&a', 'corporate finance', 'financial planning', 'treasury', 'controller']),
    t('ibanking', 'Investment banking', ['investment bank', 'mergers', 'm&a', 'capital markets', 'leveraged finance']),
    t('investing', 'Investing, asset & wealth management', ['asset management', 'investment management', 'portfolio manag', 'wealth', 'equity research', 'private equity', 'venture capital', 'hedge fund'], { search: ['investment analyst', 'wealth management'] }),
    t('quantfinance', 'Quant & trading', ['=quant', '=trading', '=trader', 'quantitative'], { exclude: ['card'] }),
    t('banking', 'Banking & lending', ['bank teller', 'banker', 'loan officer', '=lending', 'credit analyst', 'underwrit', 'mortgage'], { search: ['banker', 'credit analyst'] }),
    t('insurance', 'Insurance & actuarial', ['insurance', 'actuar', 'claims adjuster', 'claims analyst'], { search: ['insurance', 'actuarial'] }),
    t('tax', 'Tax', ['=tax'], { exclude: ['taxonomy'] }),
    t('fintechops', 'Finance operations & risk', ['risk analyst', 'risk management', 'financial operations', 'finance operations', 'billing', 'collections', 'fraud']),
  ],
  'Administrative & office': [
    t('admin', 'Administrative assistant', ['administrative assistant', 'admin assistant', 'office assistant', 'clerk', 'clerical', 'secretary']),
    t('execassist', 'Executive assistant', ['executive assistant', 'chief of staff', 'personal assistant']),
    t('reception', 'Receptionist & front desk', ['receptionist', 'front desk', 'front office']),
    t('officemgmt', 'Office & facilities management', ['office manager', 'office coordinator', 'facilities', 'workplace experience', 'workplace coordinator']),
    t('dataentry', 'Data entry & records', ['data entry', 'records', 'document control', 'transcription']),
  ],
  'Agriculture, environment & sustainability': [
    t('agriculture', 'Agriculture & farming', ['agricultur', '=farm', 'agronom', '=crop', 'horticultur', 'greenhouse grower']),
    t('envscience', 'Environmental science & conservation', ['environmental', 'conservation', 'ecolog', 'wildlife', 'forestry', 'natural resource'], { exclude: ['engineer', 'design'] }),
    t('sustainability', 'Sustainability & ESG', ['sustainab', '=esg', 'climate', 'renewable', 'clean energy', 'decarboniz']),
    t('foodscience', 'Food science', ['food scien', 'food safety', 'food technolog', 'nutrition scien']),
  ],
  'Architecture & construction': [
    t('architecture', 'Architecture', ['architectural', 'architecture intern', 'architecture+studio', '=architect', 'junior architect', 'project architect', 'design architect', 'licensed architect', 'architect+intern'], { exclude: ['software', 'solution', 'cloud', '=data', '=security', 'enterprise', 'systems', 'technical', 'network', 'it ', 'ai ', 'computer', 'gpu', 'cpu', 'chip', 'hardware', 'ssd', 'deep learning', 'modeling', 'platform', 'applied', 'salesforce', 'fraud', 'integration', 'infrastructure', 'database', 'application', 'agent', 'outcomes', 'standards', 'servicenow', 'aws', 'azure'] }),
    t('landscape', 'Landscape architecture', ['landscape architect', 'landscape design']),
    t('urbanplanning', 'Urban planning', ['urban plan', 'city plan', 'planner', 'transportation plan', 'land use'], { exclude: ['financial', '=event', 'production', 'media', 'demand', 'supply', 'meal', 'wedding'] }),
    t('construction', 'Construction management', ['construction', 'project engineer', 'site superintendent', 'superintendent', 'estimator', 'general contractor']),
  ],
  'Arts, media & entertainment': [
    t('film', 'Film & TV production', ['=film', 'production assistant', 'producer', 'television', 'tv ', 'post-production', 'editor+video', 'cinematograph']),
    t('music', 'Music & audio', ['=music', '=audio', 'sound design', 'sound engineer', 'composer', 'recording']),
    t('journalism', 'Journalism & reporting', ['journalis', 'reporter', '=news', 'correspondent', 'editorial assistant']),
    t('writing', 'Writing & editing', ['writer', 'editor', 'copyeditor', 'proofread', 'technical writ', 'content writ'], { exclude: ['video', 'software'] }),
    t('publishing', 'Publishing & books', ['publishing', 'publisher', 'literary', '=book']),
    t('performing', 'Performing arts', ['=actor', 'actress', '=dancer', 'musician', 'performer', 'theater', 'theatre', 'stage manag']),
    t('finearts', 'Fine arts, museums & galleries', ['=museum', '=gallery', 'curator', 'curatorial', 'art handler', 'collections', 'archiv']),
    t('broadcasting', 'Broadcasting & podcasts', ['broadcast', '=radio', 'podcast', '=anchor']),
  ],
  'Business & operations': [
    t('businessanalysis', 'Business analysis', ['business analyst', 'business analysis', 'business intelligence', 'operations analyst']),
    t('operations', 'Operations', ['operations', 'business operations', 'operations coordinator', 'operations associate'], { exclude: ['=security', 'devops', 'it operations'] }),
    t('consulting', 'Consulting & strategy', ['consult', 'strategy', 'strategic', 'advisory'], { exclude: ['content strateg', 'brand strateg', 'social', 'creative strateg'] }),
    t('bizdev', 'Business development & partnerships', ['business development', 'partnership', 'alliances', 'corporate development']),
    t('generalmgmt', 'General management & leadership development', ['general manag', 'management trainee', 'leadership development', 'rotational', 'associate program']),
    t('entrepreneur', 'Startups & founder\'s office', ['founder', 'startup', 'entrepreneur', 'venture']),
  ],
  'Customer service & support': [
    t('customerservice', 'Customer service', ['customer service', 'customer support', 'customer care', 'call center', 'contact center', 'guest services']),
    t('customersuccess', 'Customer success & account management', ['customer success', 'client success', 'customer experience', 'client services', 'onboarding specialist']),
    t('techsupport', 'Technical support', ['technical support', 'tech support', 'support engineer', 'support specialist', 'help desk', 'helpdesk']),
  ],
  Design: [
    t('design', 'UI/UX & product design', ['product design', 'ux', 'ui', 'user experience', 'user interface', 'interaction design', 'experience design', 'web design', 'designer', 'design'], { excludeTechnical: true, search: ['UX designer', 'product designer', 'UI designer'] }),
    t('uxresearch', 'UX research', ['user research', 'ux+research', 'design research', 'usability'], { exclude: ['scientist'], search: ['UX researcher'] }),
    t('visual', 'Graphic, brand & visual design', ['graphic', 'visual design', 'visual', 'brand design', 'brand', 'creative', 'art direct', 'communication design', 'marketing design', 'packaging design'], { excludeTechnical: true, search: ['graphic designer', 'brand designer', 'visual designer'] }),
    t('illustration', 'Illustration, motion & animation', ['illustrat', 'motion', 'animat', 'artist', '3d', 'video', 'storyboard'], { excludeTechnical: true, search: ['illustrator', 'motion designer', 'animator'] }),
    t('game', 'Game art & design', ['game design', 'game designer', 'game art', 'game artist', 'game ui', 'ui artist', 'concept art', 'environment art', 'character art', 'level design', 'narrative design'], { excludeTechnical: true, search: ['game designer', 'game artist'] }),
    t('contentdesign', 'Content design & UX writing', ['content design', 'ux writ', 'ux copy', 'content strateg', 'product writ', 'conversation design'], { search: ['content designer', 'UX writer'] }),
    t('photovideo', 'Photo, video & production', ['photograph', 'videograph', 'video edit', 'video produc', 'post-production', 'post production', 'production assist', 'content produc', 'multimedia'], { exclude: NOT_TECH, search: ['photographer', 'video editor'] }),
    t('print', 'Print, packaging & environmental design', ['packaging', 'print design', 'print production', 'publication design', 'editorial design', 'environmental design', 'exhibit', 'experiential design', 'signage', 'wayfinding', 'retail design', 'store design', 'textile', 'apparel graphic', 'surface design'], { excludeTechnical: true, search: ['packaging designer', 'environmental designer', 'print designer'] }),
    t('creativetech', 'Design engineering, creative tech & front-end', ['creative technolog', 'design technolog', 'ux engineer', 'prototyp', 'webflow', 'web develop', 'front-end develop', 'frontend develop', 'front end develop', 'design engineer', 'design engineering'], { exclude: ['software engineer', 'hardware', 'electrical', 'mechanical', 'asic', 'silicon', 'verification', 'pcb', 'physical design', 'analog', 'board design', 'circuit', 'fpga', 'cpu', 'gpu', 'rf ', 'actuator', 'motor', 'gear', 'system design', 'thermal', 'optical', 'power ', 'structural', 'civil', 'layout engineer'], search: ['design engineer', 'creative technologist', 'front end developer'] }),
    t('fashion', 'Fashion & apparel design', ['fashion', 'apparel', 'footwear', 'accessories design', 'technical design+apparel', 'merchandis'], { search: ['fashion designer', 'apparel designer'] }),
    t('interior', 'Interior design', ['interior design', 'interior architect', 'space plan', 'furniture design'], { search: ['interior designer'] }),
    t('industrial', 'Industrial & physical product design', ['industrial design', 'product designer+physical', '=cmf', 'consumer product design', 'toy design'], { search: ['industrial designer'] }),
    t('instructional', 'Instructional & learning design', ['instructional design', 'learning design', 'curriculum design', 'learning experience design', 'e-learning'], { search: ['instructional designer'] }),
  ],
  'Education & teaching': [
    t('teaching', 'Teaching (K-12)', ['=teacher', 'teaching', 'classroom', 'substitute'], { exclude: ['assistant professor'] }),
    t('tutoring', 'Tutoring & test prep', ['=tutor', 'test prep', 'academic coach']),
    t('earlychildhood', 'Early childhood education', ['preschool', 'early childhood', 'childcare', 'child care', 'daycare', 'nanny']),
    t('highered', 'Higher education & academia', ['professor', 'lecturer', 'teaching assistant', 'research assistant', 'postdoc', 'academic advis', 'admissions', 'student affairs']),
    t('edadmin', 'Education administration', ['school administrat', 'principal', 'education coordinator', 'program coordinator+education', 'registrar']),
  ],
  Engineering: [
    t('mechanical', 'Mechanical engineering', ['mechanical engineer', 'mechanical design', 'manufacturing engineer']),
    t('electrical', 'Electrical & electronics engineering', ['electrical engineer', 'electronics', 'power engineer', 'controls engineer', 'rf engineer']),
    t('civil', 'Civil & structural engineering', ['civil engineer', 'structural engineer', 'geotechnical', 'transportation engineer', 'water resources']),
    t('chemical', 'Chemical engineering', ['chemical engineer', 'process engineer']),
    t('aerospace', 'Aerospace engineering', ['aerospace', 'aeronautic', 'avionics', 'propulsion', 'spacecraft', 'satellite']),
    t('biomedical', 'Biomedical engineering', ['biomedical', 'medical device', 'bioengineer']),
    t('industrialeng', 'Industrial & manufacturing engineering', ['industrial engineer', 'manufacturing', 'process improvement', '=lean', 'quality engineer']),
    t('hardware', 'Hardware, chips & semiconductors', ['hardware', 'asic', 'fpga', 'semiconductor', 'silicon', 'chip', 'pcb', 'physical design', 'verification engineer', 'analog']),
    t('robotics', 'Robotics & automation', ['robot', 'automation engineer', 'mechatronic', 'autonomy']),
    t('environmentaleng', 'Environmental engineering', ['environmental engineer', 'water engineer', 'wastewater']),
  ],
  'Healthcare & medicine': [
    t('nursing', 'Nursing', ['=nurse', 'nursing', 'rn ', '=lpn', '=cna']),
    t('physician', 'Physicians & clinicians', ['physician', 'doctor', 'surgeon', 'resident physician', 'physician assistant', 'nurse practitioner']),
    t('pharmacy', 'Pharmacy', ['pharmac']),
    t('dental', 'Dental', ['=dental', 'dentist', 'hygienist', 'orthodont']),
    t('therapy', 'Physical, occupational & speech therapy', ['physical therap', 'occupational therap', '=speech', 'rehab', 'respiratory therap']),
    t('mentalhealth', 'Mental health & counseling', ['mental health', 'counselor', 'counseling', 'therapist', 'psycholog', 'behavioral']),
    t('medtech', 'Medical assistants & technicians', ['medical assistant', 'technician+medical', '=lab tech', 'phlebotom', 'radiolog', 'sonograph', '=emt', 'paramedic']),
    t('publichealth', 'Public health', ['public health', 'epidemiolog', 'health educator', 'community health']),
    t('healthadmin', 'Healthcare administration', ['healthcare admin', 'medical billing', 'medical coding', 'patient access', 'health information', 'clinic manager']),
    t('veterinary', 'Veterinary & animal care', ['veterinar', 'vet tech', 'animal care', '=zoo']),
  ],
  'Hospitality, food & travel': [
    t('foodservice', 'Restaurants & food service', ['=server', 'barista', '=host', 'restaurant', 'food service', 'bartender'], { exclude: ['software', 'engineer', 'cloud', 'hosting'] }),
    t('culinary', 'Culinary & chef', ['=chef', 'sous chef', '=cook', 'line cook', 'prep cook', 'culinary', 'pastry', '=kitchen', 'baker'], { exclude: ['de produit', 'de projet', 'chef de'] }),
    t('hotels', 'Hotels & lodging', ['hotel', 'hospitality', 'resort', 'concierge', 'guest experience']),
    t('travel', 'Travel & tourism', ['=travel', 'tourism', 'tour guide', 'flight attendant']),
    t('events', 'Events & event planning', ['=event', '=events', 'wedding', 'conference', 'meeting planner']),
  ],
  'Human resources & recruiting': [
    t('hr', 'HR generalist & people operations', ['human resources', 'hr ', 'people operations', 'people partner', 'hr generalist', 'hrbp', 'employee relations']),
    t('recruiting', 'Recruiting & talent acquisition', ['recruit', 'talent acquisition', 'sourcer', 'sourcing']),
    t('compensation', 'Compensation & benefits', ['compensation', '=benefits', 'total rewards', 'payroll']),
    t('learningdev', 'Learning & development', ['learning and development', 'learning & development', '=training', 'l&d', 'enablement']),
    t('dei', 'Diversity, equity & inclusion', ['diversity', 'inclusion', '=dei', 'belonging']),
  ],
  'Legal, government & public safety': [
    t('law', 'Lawyers & legal counsel', ['attorney', 'lawyer', '=counsel', '=legal', 'law clerk', 'associate+law']),
    t('paralegal', 'Paralegal & legal assistant', ['paralegal', 'legal assistant', 'legal secretary']),
    t('compliance', 'Compliance & regulatory', ['compliance', 'regulatory', '=aml', '=kyc', '=privacy']),
    t('policy', 'Policy & government', ['=policy', 'government', 'legislative', 'public affairs', 'public administration', 'civic']),
    t('publicsafety', 'Law enforcement & public safety', ['=police', 'law enforcement', 'firefight', 'emergency management', 'corrections', 'security officer', 'dispatcher']),
  ],
  'Manufacturing & production': [
    t('production', 'Production & assembly', ['production', 'assembl', 'operator', 'manufacturing associate', 'machine operator'], { exclude: ['video', '=film', 'design', 'print', 'content', 'software', 'post-production'] }),
    t('qualitycontrol', 'Quality control & inspection', ['quality control', 'quality assurance+manufactur', 'inspector', 'quality inspector', 'qc ']),
    t('machining', 'Machining, welding & fabrication', ['machinist', '=cnc', 'welder', 'welding', 'fabricat']),
  ],
  'Marketing & communications': [
    t('marketing', 'Marketing, content & social', ['marketing', 'content', 'social media', 'communications', 'copywrit', 'brand', 'growth', 'community'], { exclude: NOT_TECH, search: ['marketing', 'social media', 'content creator'] }),
    t('digitalmarketing', 'Digital & performance marketing', ['digital marketing', 'performance marketing', 'paid media', 'paid social', '=sem', '=ppc', '=seo', 'growth marketing']),
    t('socialmedia', 'Social media & community', ['social media', 'community manager', 'creator partnerships', 'influencer']),
    t('copywriting', 'Copywriting & content marketing', ['copywrit', 'content marketing', 'content writer', 'content creator', 'blog']),
    t('pr', 'Public relations & communications', ['public relations', 'pr ', 'communications', 'media relations', '=press', 'publicist']),
    t('brandmgmt', 'Brand & product marketing', ['brand manag', 'product marketing', 'brand marketing', 'go-to-market', '=gtm']),
    t('advertising', 'Advertising & media buying', ['advertising', 'media buy', 'media plan', 'account executive+advertising', 'ad operations']),
    t('marketresearch', 'Market research & insights', ['market research', 'consumer insights', 'insights analyst', 'marketing analyst']),
    t('emailcrm', 'Email, CRM & lifecycle marketing', ['email marketing', '=crm', 'lifecycle', 'retention marketing', 'marketing automation']),
  ],
  'Nonprofit & social services': [
    t('socialwork', 'Social work & case management', ['social work', 'case manager', 'case management', 'caseworker', 'family advocate']),
    t('community', 'Community outreach & organizing', ['community outreach', 'organizer', 'outreach', 'volunteer coordinator', 'advocacy']),
    t('fundraising', 'Fundraising & development', ['fundrais', 'development associate', 'development officer', '=grant', 'donor']),
    t('nonprofitprograms', 'Nonprofit programs', ['program coordinator', 'program associate', 'program manager+nonprofit', 'youth program', 'americorps']),
  ],
  'Product & project management': [
    t('product', 'Product management', ['product manag', 'product owner', 'associate product', '=apm', 'program manag', 'product'], { categories: ['Product', 'Product Management'], exclude: ['design', 'engineer'], search: ['product manager'] }),
    t('projectmgmt', 'Project management', ['project manag', 'project coordinator', '=pmo', 'project associate']),
    t('programmgmt', 'Program management', ['program manag', 'technical program', '=tpm']),
    t('productops', 'Product operations & agile', ['product operations', 'scrum master', 'agile coach', 'delivery manager']),
  ],
  'Real estate & property': [
    t('realestate', 'Real estate sales & brokerage', ['real estate', 'realtor', 'leasing', 'broker']),
    t('propertymgmt', 'Property management', ['property manag', 'community manager+apartment', 'facilities manag', 'leasing consultant']),
    t('realestatefinance', 'Real estate finance & development', ['real estate development', 'acquisitions', 'real estate analyst', 'appraiser']),
  ],
  'Sales & business development': [
    t('sales', 'Sales & account executive', ['=sales', 'account executive', 'sales representative', 'inside sales']),
    t('sdr', 'Sales development (SDR/BDR)', ['sales development', 'business development representative', '=sdr', '=bdr', 'lead generation']),
    t('accountmgmt', 'Account management', ['account manager', 'account management', 'key account', 'client manager']),
    t('retail', 'Retail & store associate', ['=retail', 'store associate', 'sales associate', 'cashier', 'visual merchandis', 'store manager']),
    t('salesengineering', 'Sales & solutions engineering', ['sales engineer', 'solutions engineer', 'solutions consultant', 'pre-sales', 'presales']),
  ],
  'Science & research': [
    t('biology', 'Biology & life sciences', ['biolog', 'life science', 'microbiolog', 'genetic', 'molecular', 'biotech', 'neuroscien']),
    t('chemistry', 'Chemistry & materials', ['chemist', 'chemistry', 'materials scien', 'analytical chem']),
    t('physics', 'Physics & astronomy', ['physic', 'astronom', 'optics', 'quantum']),
    t('labresearch', 'Lab & research assistant', ['research assistant', 'research associate', 'lab assistant', 'laboratory', 'research technician']),
    t('clinicalresearch', 'Clinical research', ['clinical research', 'clinical trial', 'clinical data', 'study coordinator']),
    t('math', 'Math & statistics', ['statistic', 'mathematic', 'biostatistic', 'econometric']),
    t('socialscience', 'Psychology & social science research', ['psycholog', 'sociolog', 'econom', 'anthropolog', 'social science', 'survey research', 'policy research']),
  ],
  'Skilled trades & transportation': [
    t('electrician', 'Electrician', ['electrician', 'electrical apprentice', 'lineman', 'lineworker']),
    t('plumbing', 'Plumbing & HVAC', ['plumb', 'hvac', 'pipefitter', 'refrigeration']),
    t('carpentry', 'Carpentry & building trades', ['carpent', '=mason', 'roofer', '=painter', 'drywall', 'laborer', 'apprentice']),
    t('automotive', 'Automotive & mechanics', ['mechanic', 'automotive', 'auto technician', '=diesel', 'collision']),
    t('driving', 'Driving & delivery', ['=driver', '=delivery', '=courier', '=cdl', '=truck']),
    t('aviation', 'Aviation & pilots', ['=pilot', 'aviation', 'aircraft mechanic', 'air traffic', '=flight']),
    t('maritime', 'Maritime & rail', ['maritime', 'deckhand', '=marine', 'railroad', 'conductor']),
  ],
  'Sports, fitness & wellness': [
    t('fitness', 'Fitness & personal training', ['personal trainer', '=fitness', '=yoga', 'pilates', 'strength coach']),
    t('coaching', 'Coaching & athletics', ['=coach', 'athletic', 'athletics', 'sports']),
    t('sportsbusiness', 'Sports business & management', ['sports marketing', 'sports management', 'team operations', '=ticket', 'stadium']),
    t('wellness', 'Wellness, beauty & personal care', ['wellness', '=massage', 'esthetician', 'cosmetolog', '=stylist', '=salon', '=spa']),
  ],
  'Supply chain & logistics': [
    t('supplychain', 'Supply chain', ['supply chain', 'demand plan', 'supply plan', 'planning analyst', 'materials manag']),
    t('logistics', 'Logistics & warehousing', ['logistics', 'warehouse', 'distribution', 'fulfillment', '=shipping', 'transportation coordinator']),
    t('procurement', 'Procurement & purchasing', ['procurement', 'purchasing', '=buyer', 'sourcing specialist', 'category manag']),
    t('inventory', 'Inventory & operations planning', ['=inventory', 'production planner', 'scheduler', 'sales and operations planning', 's&op']),
  ],
  'Technology & software': [
    t('software', 'Software engineering', ['software', 'engineer', 'developer', 'programmer', '=swe', 'front', 'back', 'full stack', 'full-stack', '=mobile', '=ios', '=android', 'web', 'platform', 'infrastructure'], { categories: ['Software', 'Software Engineering'], exclude: ['hardware', 'electrical', 'mechanical', 'civil', 'chemical', 'manufacturing', '=sales'], search: ['software engineer'] }),
    t('data', 'Data, AI & analytics', ['=data', 'analytics', 'analyst', 'machine learning', '=ml', '=ai', 'scientist', 'business intelligence', 'research'], { categories: ['AI/ML/Data', 'Data Science, AI & Machine Learning'], search: ['data analyst', 'data scientist'] }),
    t('dataeng', 'Data engineering', ['data engineer', 'analytics engineer', '=etl', 'data platform']),
    t('mlai', 'Machine learning & AI', ['machine learning', 'ml engineer', 'ai engineer', 'deep learning', '=nlp', 'computer vision', 'applied scientist', '=llm']),
    t('security', 'Cybersecurity', ['=security', '=cyber', 'infosec', 'penetration', 'soc analyst', 'threat'], { exclude: ['security officer', 'social security'] }),
    t('it', 'IT & systems administration', ['it support', 'it specialist', 'systems administrator', 'sysadmin', 'it technician', 'desktop support', 'information technology']),
    t('devops', 'Cloud, DevOps & SRE', ['devops', 'site reliability', '=sre', 'cloud engineer', 'platform engineer', 'infrastructure engineer', 'kubernetes']),
    t('qa', 'QA & software testing', ['=qa', 'quality assurance', 'test engineer', 'software tester', 'sdet', 'test automation']),
    t('mobile', 'Mobile development', ['=ios', '=android', 'mobile engineer', 'mobile developer', 'react native', 'flutter']),
    t('webdev', 'Web development', ['web developer', 'front-end', 'frontend', 'front end', 'full stack', 'full-stack', 'web engineer']),
    t('gamedev', 'Game programming', ['game developer', 'gameplay engineer', 'game programmer', 'unity developer', 'unreal']),
    t('networking', 'Networking & telecom', ['network engineer', 'network administrator', 'telecom', 'network technician']),
    t('embedded', 'Embedded & firmware', ['embedded', 'firmware']),
    t('solutions', 'Solutions & cloud architecture', ['solutions architect', 'cloud architect', 'technical consultant', 'implementation specialist', 'implementation consultant']),
  ],
};

// The Muse's own categories for each of these categories (Find searches The Muse in the ones that match what you ticked).
export const MUSE_CATEGORIES = {
  'Accounting & finance': ['Accounting and Finance'],
  'Administrative & office': ['Administration and Office'],
  'Agriculture, environment & sustainability': ['Science and Engineering'],
  'Architecture & construction': ['Science and Engineering', 'Installation, Maintenance, and Repairs'],
  'Arts, media & entertainment': ['Arts', 'Media, PR, and Communications', 'Editor', 'Writer'],
  'Business & operations': ['Business Operations', 'Management'],
  'Customer service & support': ['Customer Service'],
  Design: ['Design and UX', 'Arts'],
  'Education & teaching': ['Education'],
  Engineering: ['Science and Engineering'],
  'Healthcare & medicine': ['Healthcare'],
  'Hospitality, food & travel': ['Food and Hospitality Services'],
  'Human resources & recruiting': ['Human Resources and Recruitment'],
  'Legal, government & public safety': ['Legal Services', 'Law Enforcement and Security'],
  'Manufacturing & production': ['Manufacturing and Warehouse'],
  'Marketing & communications': ['Advertising and Marketing', 'Media, PR, and Communications'],
  'Nonprofit & social services': ['Social Services', 'Nonprofit'],
  'Product & project management': ['Project Management', 'Product Management'],
  'Real estate & property': ['Real Estate'],
  'Sales & business development': ['Sales', 'Account Management', 'Retail'],
  'Science & research': ['Science and Engineering'],
  'Skilled trades & transportation': ['Installation, Maintenance, and Repairs', 'Transportation and Logistics'],
  'Sports, fitness & wellness': ['Sports, Fitness and Recreation'],
  'Supply chain & logistics': ['Transportation and Logistics'],
  'Technology & software': ['Software Engineering', 'Computer and IT', 'Data and Analytics'],
};

/** All types in one list, each with its category. Your own finder.presets in config.json are added (or override). */
export function allJobTypes(custom = {}) {
  const out = new Map();
  for (const [category, types] of Object.entries(CATEGORIES)) for (const type of types) out.set(type.key, { ...type, category });
  for (const [key, p] of Object.entries(custom || {})) {
    if (key === 'any') continue;
    out.set(key, { ...(out.get(key) || {}), ...p, key, category: p.category || out.get(key)?.category || 'Your own', search: p.search || out.get(key)?.search || plain((p.include || []).slice(0, 2)) });
  }
  return [...out.values()];
}
