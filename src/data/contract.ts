// Dummy home-insurance contract (conditions générales + particulières), fictional.
// Each article is a retrievable chunk with a stable reference for citations.

export interface ContractChunk {
  ref: string; // e.g. "CG Art. 4.2"
  title: string;
  text: string;
}

export const contractMeta = {
  contractNumber: 'HAB-2026-004817',
  insurer: 'Atlantique Assur',
  product: 'Habitation Locataire Confort',
  insured: 'M. Karim Benali',
  address: '12 rue de la Paix, 72000 Le Mans',
};

export const contractChunks: ContractChunk[] = [
  // --- Conditions particulières ---
  {
    ref: 'CP Art. 1',
    title: 'Désignation du risque',
    text: 'Logement assuré : appartement de 3 pièces (62 m²) au 2e étage, situé 12 rue de la Paix, 72000 Le Mans. Qualité de l’assuré : locataire. Résidence principale.',
  },
  {
    ref: 'CP Art. 2',
    title: 'Capitaux et franchises',
    text: 'Capital mobilier assuré : 25 000 €. Objets de valeur : plafonnés à 3 000 € au total. Franchise générale : 200 € par sinistre. Franchise catastrophes naturelles : montant légal en vigueur (380 €).',
  },
  {
    ref: 'CP Art. 3',
    title: 'Cotisation',
    text: 'Cotisation annuelle TTC : 168 €, payable mensuellement (14 €/mois) par prélèvement. Date d’effet : 1er septembre 2026. Échéance principale : 1er septembre.',
  },
  // --- Conditions générales ---
  {
    ref: 'CG Art. 1',
    title: 'Responsabilité civile vie privée',
    text: 'Nous garantissons les conséquences pécuniaires de la responsabilité civile que l’assuré peut encourir en raison de dommages corporels, matériels ou immatériels causés à des tiers au cours de sa vie privée. Plafond : 4 500 000 € pour les dommages corporels, 1 000 000 € pour les dommages matériels.',
  },
  {
    ref: 'CG Art. 2',
    title: 'Dégâts des eaux',
    text: 'Sont garantis les dommages matériels causés par les fuites, ruptures ou débordements de conduites non enterrées, d’appareils à effet d’eau, de chéneaux et gouttières, ainsi que les infiltrations à travers les toitures. Sont exclus : les frais de réparation des conduites elles-mêmes, les dommages dus à l’humidité ou la condensation, et les infiltrations par les joints d’étanchéité des sanitaires non entretenus.',
  },
  {
    ref: 'CG Art. 3',
    title: 'Incendie et événements assimilés',
    text: 'Sont garantis les dommages causés par l’incendie, l’explosion, l’implosion, la chute de la foudre et les dommages électriques aux appareils lorsque leur valeur unitaire excède 150 €. Les dommages électriques sont indemnisés après application d’une vétusté de 10 % par an, plafonnée à 70 %.',
  },
  {
    ref: 'CG Art. 4.1',
    title: 'Vol – conditions de garantie',
    text: 'Le vol est garanti uniquement s’il est commis avec effraction, escalade, usage de fausses clés, ou par une personne s’étant introduite clandestinement ou par ruse dans le logement. Le vol sans effraction ni violence n’est pas couvert.',
  },
  {
    ref: 'CG Art. 4.2',
    title: 'Vol – obligations de prévention',
    text: 'En cas d’absence supérieure à 24 heures, l’assuré doit fermer à clé toutes les portes et fermer les fenêtres et volets. Le non-respect de ces mesures, s’il a facilité le vol, entraîne une réduction de l’indemnité de 50 %.',
  },
  {
    ref: 'CG Art. 5',
    title: 'Bris de glace',
    text: 'Sont garantis le bris accidentel des vitres, fenêtres, baies vitrées et plaques vitrocéramiques. Sont exclus les rayures, écaillures et le bris survenant au cours de travaux réalisés par l’assuré.',
  },
  {
    ref: 'CG Art. 6',
    title: 'Catastrophes naturelles',
    text: 'La garantie est acquise lorsque l’état de catastrophe naturelle est constaté par arrêté interministériel publié au Journal officiel. Une franchise légale reste à la charge de l’assuré.',
  },
  {
    ref: 'CG Art. 7',
    title: 'Exclusions générales',
    text: 'Sont exclus de toutes les garanties : les dommages intentionnellement causés ou provoqués par l’assuré, les dommages résultant de la guerre civile ou étrangère, les dommages dus à un défaut d’entretien manifeste connu de l’assuré, ainsi que les amendes et pénalités.',
  },
  {
    ref: 'CG Art. 8',
    title: 'Déclaration de sinistre',
    text: 'L’assuré doit déclarer le sinistre dans les 5 jours ouvrés suivant sa connaissance. Ce délai est réduit à 2 jours ouvrés en cas de vol, et porté à 10 jours après publication de l’arrêté en cas de catastrophe naturelle. En cas de vol, un dépôt de plainte auprès des autorités est obligatoire. Une déclaration tardive peut entraîner la déchéance de garantie si elle cause un préjudice à l’assureur.',
  },
  {
    ref: 'CG Art. 9',
    title: 'Indemnisation',
    text: 'Le mobilier est indemnisé en valeur d’usage, c’est-à-dire valeur de remplacement à neuf déduction faite de la vétusté. L’indemnité est versée dans les 30 jours suivant l’accord entre les parties. La franchise prévue aux conditions particulières est déduite de chaque indemnité.',
  },
  {
    ref: 'CG Art. 10',
    title: 'Résiliation',
    text: 'Après la première année, l’assuré peut résilier le contrat à tout moment, la résiliation prenant effet un mois après réception de la notification par l’assureur (loi Hamon). L’assuré peut également résilier en cas de déménagement, dans les 3 mois suivant l’événement.',
  },
];
