import { useNavigate } from "react-router-dom";
import "../styles/emitir.css";

export default function Emitir() {
  const navigate = useNavigate();

  return (
    <div className="emitir-container">
      <h1>Escolha o tipo de emissão</h1>
      <div className="opcoes-grid">
        <div className="opcao-card" onClick={() => navigate("/emitir/fatura")}>
          <span className="opcao-icon">💰</span>
          <h3>Fatura</h3>
          <p>Emissão de faturas</p>
        </div>

        <div className="opcao-card" onClick={() => navigate("/emitir/fatura-planilha")}>
          <span className="opcao-icon">📋</span>
          <h3>Fatura + Descrição</h3>
          <p>Fatura com descrições por condômino via planilha</p>
        </div>

        <div className="opcao-card" onClick={() => navigate("/emitir/individual")}>
          <span className="opcao-icon">👤</span>
          <h3>Individual</h3>
          <p>Emissão individual</p>
        </div>

        {/* import XLSX descontinuado; nova importação será projetada (card Excel ocultado) */}
      </div>
    </div>
  );
}