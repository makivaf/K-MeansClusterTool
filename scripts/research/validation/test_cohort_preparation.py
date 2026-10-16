"""Focused selection/duplicate parity checks for cached candidate records."""
from pathlib import Path
import sys
import unittest
import pandas as pd

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'study_entry'))
import construct_study_entry_cohort as cohort


class CohortPreparationTests(unittest.TestCase):
    def rows(self, values):
        records=[]
        for i, value in enumerate(values):
            records.append(dict(RID='1',PTID='fixture',PHASE='ADNI1',VISCODE='bl',VISCODE2='bl',VISDATE='2005-01-01',
                ID=str(9-i),_SOURCE_ROW_NUMBER=i+2,_VISDATE_PARSED=pd.Timestamp('2005-01-01'),
                _VISIT_CLASS='literal_or_translated_baseline',**value))
        return pd.DataFrame(records)

    def test_direct_duplicate_tie_and_conflict(self):
        spec=next(s for s in cohort.VARIABLES if s.output=='ADAS13')
        rows=self.rows([{'TOTAL13':'8'},{'TOTAL13':'8'}])
        value,reason,selected,duplicate=cohort.resolve_direct('1','fixture',spec,'ADNI1',rows,set())
        self.assertEqual((value,reason,selected['ID']),(8,'','8'))
        self.assertEqual(duplicate['resolution_status'],'RESOLVED_IDENTICAL_VALID_VALUES')
        self.assertIs(cohort.candidate_records(rows),cohort.candidate_records(rows))
        conflict=self.rows([{'TOTAL13':'8'},{'TOTAL13':'9'}])
        self.assertEqual(cohort.resolve_direct('1','fixture',spec,'ADNI1',conflict,set())[:3],(None,'UNRESOLVED_DUPLICATE_QC',None))
        missing=self.rows([{'TOTAL13':'-4'},{'TOTAL13':''}])
        self.assertEqual(cohort.resolve_direct('1','fixture',spec,'ADNI1',missing,{('ADAS.csv','TOTAL13','-4')})[:2],(None,'MINUS4'))

    def test_derived_component_conflict_and_negative(self):
        spec=next(s for s in cohort.VARIABLES if s.output=='RAVLT_FORGETTING')
        # Equal derived differences do not authorize resolving conflicting vectors.
        conflict=self.rows([{'AVTOT5':'5','AVDEL30MIN':'8'},{'AVTOT5':'6','AVDEL30MIN':'9'}])
        self.assertEqual(cohort.resolve_derived('1','fixture',spec,'ADNI1',conflict,set())[:3],(None,'UNRESOLVED_DUPLICATE_QC',None))
        valid=self.rows([{'AVTOT5':'5','AVDEL30MIN':'8'}])
        self.assertEqual(cohort.resolve_derived('1','fixture',spec,'ADNI1',valid,set())[:2],(-3,''))
        missing=self.rows([{'AVTOT5':'','AVDEL30MIN':'8'}])
        self.assertEqual(cohort.resolve_derived('1','fixture',spec,'ADNI1',missing,set())[:2],(None,'FAILED_DERIVATION'))

if __name__=='__main__':unittest.main()
