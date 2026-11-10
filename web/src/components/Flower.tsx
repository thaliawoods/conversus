const petals = [0, 1, 2, 3, 4];

function Flower({ className = "flower" }: { className?: string }) {
  return (
    <svg className={className} viewBox="-50 -50 100 100">
      {petals.map((petal) => {
        const angle = (petal * 2 * Math.PI) / petals.length;
        return (
          <circle
            className="flower-petal"
            key={petal}
            cx={Math.sin(angle) * 24}
            cy={-Math.cos(angle) * 24}
            r={22}
          />
        );
      })}
      <circle className="flower-heart" r={12} />
    </svg>
  );
}

export default Flower;