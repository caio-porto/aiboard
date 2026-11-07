"""Agente Financeiro AI Board (Fase 2 - Conta Azul, Contas Correntes, E-mails Financeiros)."""
import os
from typing import Dict, Any
from crewai import Agent, Crew, Process, Task, LLM
from crews.operational_crew import get_gemini_llm
from tools.google_workspace_tools import GmailSearchTool, GoogleDriveSearchTool
from tools.telegram_tools import TelegramAlertTool

def create_financial_crew(user_request: str) -> Crew:
    """Instancia a Crew Financeira para conciliação e auditoria."""
    llm = get_gemini_llm()

    gmail_search = GmailSearchTool()
    drive_search = GoogleDriveSearchTool()
    telegram_alert = TelegramAlertTool()

    agente_conciliador = Agent(
        role="Auditor e Analista Financeiro",
        goal="Verificar pagamentos, conciliar extratos de contas correntes, conferir lançamentos no Conta Azul, monitorar e-mails fiscais/financeiros e alertar gestores no Telegram quando solicitado ou ao detectar anomalias.",
        backstory=(
            "Você é o especialista financeiro da organização. Responsável por garantir que todas as entradas "
            "e saídas bancárias estejam devidamente conciliadas com o Conta Azul e que nenhuma fatura ou boleto expire sem aviso. "
            "Sempre que instruído a avisar no Telegram ou ao constatar qualquer conta em atraso ou boleto pendente no dia, você aciona a ferramenta telegram_alert."
        ),
        tools=[gmail_search, drive_search, telegram_alert],
        llm=llm,
        verbose=True
    )

    tarefa_financeira = Task(
        description=f"Analisar e responder a seguinte demanda financeira: '{user_request}'. Se houver instrução para alertar no Telegram ou se encontrar contas não pagas/divergências, dispare o alerta via telegram_alert.",
        expected_output="Relatório de conciliação ou auditoria financeira detalhado com números, status de liquidação e confirmação do alerta enviado no Telegram.",
        agent=agente_conciliador
    )

    return Crew(
        agents=[agente_conciliador],
        tasks=[tarefa_financeira],
        process=Process.sequential,
        verbose=True
    )

def run_financial_crew(prompt: str) -> str:
    crew = create_financial_crew(prompt)
    return str(crew.kickoff())
