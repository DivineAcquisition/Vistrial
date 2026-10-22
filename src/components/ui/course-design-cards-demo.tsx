import Card from "@/components/ui/course-design-cards";

function portrait(id: string): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=160&h=160&q=80`;
}

const cardData = [
  {
    id: 1,
    colorClass: "green" as const,
    date: "Feb 2, 2021",
    title: "web designing",
    description: "Prototyping",
    progressPercent: "90%",
    progressValue: "90%",
    imgSrc1: portrait("1494790108377-be9c29b29330"),
    imgAlt1: "User 1",
    imgSrc2: portrait("1500648767791-00dcc994a43e"),
    imgAlt2: "User 2",
    countdownText: "2 days left",
  },
  {
    id: 2,
    colorClass: "orange" as const,
    date: "Feb 05, 2021",
    title: "mobile app",
    description: "Shopping",
    progressPercent: "30%",
    progressValue: "30%",
    imgSrc1: portrait("1438761681033-6461ffad8d80"),
    imgAlt1: "User 3",
    imgSrc2: portrait("1472099645785-5658abf4ff4e"),
    imgAlt2: "User 4",
    countdownText: "3 weeks left",
  },
  {
    id: 3,
    colorClass: "red" as const,
    date: "March 03, 2021",
    title: "dashboard",
    description: "Medical",
    progressPercent: "50%",
    progressValue: "50%",
    imgSrc1: portrait("1507003211169-0a1dd7228f2d"),
    imgAlt1: "User 5",
    imgSrc2: portrait("1534528741775-53994a69daeb"),
    imgAlt2: "User 6",
    countdownText: "3 weeks left",
  },
  {
    id: 4,
    colorClass: "blue" as const,
    date: "March 08, 2021",
    title: "web designing",
    description: "Wireframing",
    progressPercent: "20%",
    progressValue: "20%",
    imgSrc1: portrait("1544005313-94ddf0286df2"),
    imgAlt1: "Erik Longman",
    imgSrc2: portrait("1506794778202-cad84cf45f1d"),
    imgAlt2: "Jane Doe",
    countdownText: "3 weeks left",
  },
];

export default function DefaultDemo() {
  return (
    <section className="course-design" aria-label="Course design cards">
      {cardData.map((card) => (
        <Card key={card.id} data={card} />
      ))}
    </section>
  );
}
